/*
 * bracket.js — pure tournament-bracket engine (no DOM, no globals).
 *
 * Generates single- and double-elimination brackets from a list of players,
 * with standard (or randomized) seeding, byes for non-power-of-two fields,
 * and result reporting that automatically advances winners/losers.
 *
 * Works both in the browser (attaches window.Bracket) and in Node (module.exports)
 * so the logic can be unit-tested outside a browser.
 */
(function (root, factory) {
	if (typeof module !== "undefined" && module.exports) {
		module.exports = factory();
	} else {
		root.Bracket = factory();
	}
})(typeof self !== "undefined" ? self : this, function () {
	"use strict";

	// ---- small helpers -------------------------------------------------------

	function nextPow2(n) {
		let p = 1;
		while (p < n) p *= 2;
		return Math.max(p, 1);
	}

	function log2(n) {
		return Math.round(Math.log(n) / Math.log(2));
	}

	/**
	 * Standard single-elimination seeding order for a bracket of `size` (a power
	 * of two). Returns an array of seed numbers (1-based) in slot order, arranged
	 * so the top seeds are spread apart (1 vs lowest, 2 on the opposite side...).
	 */
	function seedOrder(size) {
		let rounds = log2(size);
		let seeds = [1, 2];
		for (let r = 1; r < rounds; r++) {
			const out = [];
			const sum = seeds.length * 2 + 1;
			for (const s of seeds) {
				out.push(s);
				out.push(sum - s);
			}
			seeds = out;
		}
		return seeds;
	}

	/** Fisher–Yates shuffle (returns a new array). */
	function shuffle(arr, rng) {
		rng = rng || Math.random;
		const a = arr.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// ---- match model ---------------------------------------------------------
	//
	// A match has two slots. Each slot is either:
	//   { playerId }            -> a concrete player
	//   { bye: true }           -> an empty slot (auto-loss)
	//   { from: "W12"|"L12" }   -> waiting on winner/loser of match #12 (display)
	//   null                    -> to-be-determined, nothing there yet
	//
	// winnerTo / loserTo describe where the winner/loser flows once decided:
	//   { match: <id>, slot: 0|1 }
	//
	// `winner` is 0 or 1 once the match is reported.

	function makeMatch(id, bracket, round, label) {
		return {
			id: id,
			bracket: bracket, // 'WB' | 'LB' | 'GF'
			round: round, // 0-based round index within its bracket
			label: label || "",
			slots: [null, null],
			scores: [null, null],
			winner: null, // 0 | 1 | null
			winnerTo: null,
			loserTo: null,
		};
	}

	// ---- generation ----------------------------------------------------------

	/**
	 * @param {Array<{id,name}>} players  seeded order (index 0 = seed 1)
	 * @param {"single"|"double"} format
	 * @returns tournament state object
	 */
	function generate(players, format) {
		const n = players.length;
		if (n < 2) throw new Error("Need at least 2 players");
		const size = nextPow2(n);
		const k = log2(size); // number of winners-bracket rounds
		const order = seedOrder(size); // seed number per slot

		let idc = 0;
		const matches = {};
		const add = (m) => {
			matches[m.id] = m;
			return m;
		};

		// seed number -> slot content (player or bye)
		const seedSlot = (seedNum) => {
			if (seedNum <= n) return { playerId: players[seedNum - 1].id };
			return { bye: true };
		};

		// --- Winners bracket (also the whole bracket for single elim) ---
		const wb = []; // wb[r] = array of matches
		for (let r = 0; r < k; r++) {
			const cnt = size / Math.pow(2, r + 1);
			const arr = [];
			for (let i = 0; i < cnt; i++) {
				const label =
					format === "double"
						? r === k - 1
							? "WB Final"
							: "WB R" + (r + 1)
						: r === k - 1
						? "Final"
						: r === k - 2
						? "Semifinal"
						: "Round " + (r + 1);
				arr.push(add(makeMatch("W" + idc++, "WB", r, label + " #" + (i + 1))));
			}
			wb.push(arr);
		}

		// fill round-0 slots from the seeding order
		wb[0].forEach((m, i) => {
			m.slots[0] = seedSlot(order[i * 2]);
			m.slots[1] = seedSlot(order[i * 2 + 1]);
		});

		// link winners forward within WB
		for (let r = 0; r < k - 1; r++) {
			wb[r].forEach((m, i) => {
				m.winnerTo = { match: wb[r + 1][Math.floor(i / 2)].id, slot: i % 2 };
			});
		}

		let grandFinal = null;
		let grandFinalReset = null;
		let lb = [];

		if (format === "double") {
			// --- Losers bracket ---
			const totalLB = 2 * k - 2; // number of LB rounds
			for (let r = 1; r <= totalLB; r++) {
				const pair = Math.ceil(r / 2); // 1,1,2,2,3,3...
				const cnt = size / Math.pow(2, pair + 1);
				const arr = [];
				const isMinor = r === 1 || r % 2 === 1;
				for (let i = 0; i < cnt; i++) {
					arr.push(
						add(makeMatch("L" + idc++, "LB", r - 1, "LB R" + r + " #" + (i + 1)))
					);
				}
				lb.push(arr);
			}

			// grand final(s)
			grandFinal = add(makeMatch("GF", "GF", 0, "Grand Final"));
			grandFinalReset = add(makeMatch("GF2", "GF", 1, "Grand Final (reset)"));

			// WB final winner -> GF slot 0
			wb[k - 1][0].winnerTo = { match: grandFinal.id, slot: 0 };

			if (lb.length === 0) {
				// 2-player double elim: no losers bracket. The WB match loser
				// simply gets their second chance in the grand final.
				wb[0][0].loserTo = { match: grandFinal.id, slot: 1 };
			}

			// route WB losers into LB
			// WB round 0 losers -> LB round 1 (index 0), pair sequentially, both slots
			if (lb.length > 0) {
				wb[0].forEach((m, i) => {
					const target = lb[0][Math.floor(i / 2)];
					m.loserTo = { match: target.id, slot: i % 2 };
				});
			}
			// WB round r (r>=1) losers -> LB major round (index 2r-1), one per match,
			// reversed to reduce immediate rematches
			for (let r = 1; r < k; r++) {
				const lbIdx = 2 * r - 1; // 0-based LB round index that receives these
				const targets = lb[lbIdx];
				const cnt = wb[r].length;
				wb[r].forEach((m, i) => {
					const t = targets[cnt - 1 - i];
					m.loserTo = { match: t.id, slot: 1 };
				});
			}

			// link LB winners forward
			for (let idx = 0; idx < lb.length; idx++) {
				const roundNo = idx + 1; // 1-based
				const cur = lb[idx];
				if (idx === lb.length - 1) {
					// last LB round winner -> GF slot 1
					cur[0].winnerTo = { match: grandFinal.id, slot: 1 };
					continue;
				}
				const next = lb[idx + 1];
				const nextRoundNo = roundNo + 1;
				const nextIsMajor = nextRoundNo % 2 === 0;
				cur.forEach((m, i) => {
					if (nextIsMajor) {
						// major round takes one LB winner per match into slot 0
						m.winnerTo = { match: next[i].id, slot: 0 };
					} else {
						// minor round pairs winners
						m.winnerTo = {
							match: next[Math.floor(i / 2)].id,
							slot: i % 2,
						};
					}
				});
			}

			// GF winner (if WB champ wins) -> done. If LB champ wins GF, reset match.
			// This linkage is handled in report() because it is conditional.
		}

		const state = {
			format: format,
			players: players.map((p) => ({ id: p.id, name: p.name })),
			size: size,
			rounds: k,
			matches: matches,
			wbOrder: wb.map((r) => r.map((m) => m.id)),
			lbOrder: lb.map((r) => r.map((m) => m.id)),
			grandFinalId: grandFinal ? grandFinal.id : null,
			grandFinalResetId: grandFinalReset ? grandFinalReset.id : null,
			champion: null,
		};

		// auto-advance any byes present in round 0
		resolveByes(state);
		return state;
	}

	// ---- advancement ---------------------------------------------------------

	function slotPlayer(slot) {
		return slot && slot.playerId ? slot.playerId : null;
	}

	function bothFilled(m) {
		return m.slots[0] && (m.slots[0].playerId || m.slots[0].bye) &&
			m.slots[1] && (m.slots[1].playerId || m.slots[1].bye);
	}

	function pushInto(state, target, playerId) {
		const m = state.matches[target.match];
		m.slots[target.slot] = playerId ? { playerId } : { bye: true };
	}

	/** Repeatedly resolve matches that have a bye so real players advance. */
	function resolveByes(state) {
		let changed = true;
		while (changed) {
			changed = false;
			for (const id in state.matches) {
				const m = state.matches[id];
				if (m.winner !== null) continue;
				if (!bothFilled(m)) continue;
				const a = m.slots[0],
					b = m.slots[1];
				const aBye = a.bye,
					bBye = b.bye;
				if (aBye && bBye) {
					// empty match (both byes) — collapse: winner is a bye
					settle(state, m, 0, true);
					changed = true;
				} else if (aBye || bBye) {
					const winIdx = aBye ? 1 : 0;
					settle(state, m, winIdx, true);
					changed = true;
				}
			}
		}
	}

	/** Apply a decided match: set winner, flow winner/loser onward. */
	function settle(state, m, winnerIdx, viaBye) {
		m.winner = winnerIdx;
		const winSlot = m.slots[winnerIdx];
		const loseSlot = m.slots[1 - winnerIdx];
		const winnerId = winSlot.bye ? null : winSlot.playerId;
		const loserId = loseSlot.bye ? null : loseSlot.playerId;

		if (m.winnerTo) pushInto(state, m.winnerTo, winnerId);
		if (m.loserTo) pushInto(state, m.loserTo, loserId);

		// grand final logic
		if (m.id === state.grandFinalId) {
			if (winnerIdx === 0) {
				// WB champion won -> tournament over
				state.champion = winnerId;
			} else {
				// LB champion won -> reset match required
				const gf2 = state.matches[state.grandFinalResetId];
				gf2.slots[0] = winSlot.bye ? { bye: true } : { playerId: winnerId };
				gf2.slots[1] = loseSlot.bye ? { bye: true } : { playerId: loserId };
			}
		} else if (m.id === state.grandFinalResetId) {
			state.champion = winnerId;
		} else if (state.format === "single" && !m.winnerTo) {
			// single-elim final
			state.champion = winnerId;
		}
	}

	/**
	 * Report a result for match `id`. winnerIdx is 0 or 1. Optional scores.
	 * Re-reporting a match is blocked unless it has no downstream consequences
	 * already committed (kept simple: we forbid changing a settled match here;
	 * the UI offers a full "reset tournament" instead).
	 */
	function report(state, id, winnerIdx, scores) {
		const m = state.matches[id];
		if (!m) throw new Error("No such match " + id);
		if (!bothFilled(m)) throw new Error("Match is not ready");
		if (m.slots[winnerIdx].bye) throw new Error("Cannot pick a bye as winner");
		if (m.winner !== null) throw new Error("Match already reported");
		if (scores) m.scores = scores.slice(0, 2);
		settle(state, m, winnerIdx, false);
		resolveByes(state);
		return state;
	}

	/** Is a match ready to be played (both real slots filled, not yet decided)? */
	function isPlayable(m) {
		return (
			m.winner === null &&
			bothFilled(m) &&
			!m.slots[0].bye &&
			!m.slots[1].bye
		);
	}

	return {
		nextPow2,
		log2,
		seedOrder,
		shuffle,
		generate,
		report,
		isPlayable,
		_settle: settle,
		_resolveByes: resolveByes,
	};
});
