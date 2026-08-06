/* app.js — UI controller for the Brackets PWA. Depends on bracket.js (window.Bracket). */
(function () {
	"use strict";

	const B = window.Bracket;
	const SETUP_KEY = "tb.setup.v1";
	const TOURNEY_KEY = "tb.tournament.v1";

	// ---------- persisted draft (setup screen) ----------
	let draft = loadJSON(SETUP_KEY) || {
		players: [],
		format: "single",
		randomSeed: true,
	};
	// ---------- persisted tournament ----------
	let state = loadJSON(TOURNEY_KEY); // null if none

	// ---------- element refs ----------
	const el = (id) => document.getElementById(id);
	const setupView = el("setupView");
	const bracketView = el("bracketView");
	const newBtn = el("newBtn");

	const addForm = el("addForm");
	const playerNameInput = el("playerName");
	const playerList = el("playerList");
	const playersHint = el("playersHint");
	const generateBtn = el("generateBtn");
	const randomSeedInput = el("randomSeed");
	const reseedBtn = el("reseedBtn");

	const resultDialog = el("resultDialog");
	const resultForm = el("resultForm");
	const resultTitle = el("resultTitle");
	const resultSub = el("resultSub");
	const pickList = el("pickList");
	const saveResultBtn = el("saveResultBtn");
	const confirmDialog = el("confirmDialog");

	// ================= setup view =================

	function uid() {
		return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}

	function renderPlayers() {
		playerList.innerHTML = "";
		draft.players.forEach((p, i) => {
			const li = document.createElement("li");
			li.innerHTML =
				'<span class="player-seed">' +
				(i + 1) +
				'</span><span class="player-name"></span>' +
				'<button class="remove-btn" aria-label="Remove">×</button>';
			li.querySelector(".player-name").textContent = p.name;
			li.querySelector(".remove-btn").addEventListener("click", () => {
				draft.players.splice(i, 1);
				saveDraft();
				renderPlayers();
			});
			playerList.appendChild(li);
		});
		const n = draft.players.length;
		playersHint.textContent =
			n === 0
				? "Add at least 2 players to begin."
				: n === 1
				? "Add 1 more player to begin."
				: n + " players — ready to generate.";
		generateBtn.disabled = n < 2;
	}

	addForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = playerNameInput.value.trim();
		if (!name) return;
		draft.players.push({ id: uid(), name: name });
		playerNameInput.value = "";
		playerNameInput.focus();
		saveDraft();
		renderPlayers();
	});

	// format segmented control
	document.querySelectorAll(".seg-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			document.querySelectorAll(".seg-btn").forEach((b) => {
				b.classList.remove("active");
				b.setAttribute("aria-checked", "false");
			});
			btn.classList.add("active");
			btn.setAttribute("aria-checked", "true");
			draft.format = btn.dataset.format;
			saveDraft();
		});
	});

	randomSeedInput.addEventListener("change", () => {
		draft.randomSeed = randomSeedInput.checked;
		saveDraft();
	});

	generateBtn.addEventListener("click", () => {
		startTournament();
	});

	function syncSetupControls() {
		document.querySelectorAll(".seg-btn").forEach((b) => {
			const on = b.dataset.format === draft.format;
			b.classList.toggle("active", on);
			b.setAttribute("aria-checked", String(on));
		});
		randomSeedInput.checked = draft.randomSeed;
	}

	function startTournament() {
		if (draft.players.length < 2) return;
		const seeded = draft.randomSeed
			? B.shuffle(draft.players)
			: draft.players.slice();
		state = B.generate(seeded, draft.format);
		// map playerId -> seed number (position in the seeded array)
		state.seeds = {};
		seeded.forEach((p, i) => (state.seeds[p.id] = i + 1));
		saveTournament();
		showBracket();
	}

	// ================= bracket view =================

	function playerName(pid) {
		const p = state.players.find((x) => x.id === pid);
		return p ? p.name : "?";
	}

	function renderSlot(match, idx) {
		const slot = match.slots[idx];
		const div = document.createElement("div");
		div.className = "slot";
		let seed = "";
		let name = "TBD";
		if (!slot) {
			div.classList.add("tbd");
		} else if (slot.bye) {
			div.classList.add("bye");
			name = "— bye —";
		} else if (slot.playerId) {
			name = playerName(slot.playerId);
			seed = state.seeds[slot.playerId] || "";
		} else {
			div.classList.add("tbd");
		}
		if (match.winner !== null && slot && slot.playerId) {
			div.classList.add(match.winner === idx ? "winner" : "loser");
		}
		const scoreVal =
			match.scores && match.scores[idx] !== null && match.scores[idx] !== undefined
				? match.scores[idx]
				: "";
		div.innerHTML =
			'<span class="seed-chip">' +
			(seed || "") +
			'</span><span class="nm"></span><span class="sc">' +
			(scoreVal === "" ? "" : scoreVal) +
			"</span>";
		div.querySelector(".nm").textContent = name;
		return div;
	}

	function renderMatch(match) {
		const card = document.createElement("div");
		card.className = "match";
		const playable = B.isPlayable(match);
		if (playable) card.classList.add("playable");

		const label = document.createElement("div");
		label.className = "match-label";
		const lab = document.createElement("span");
		lab.textContent = match.label;
		label.appendChild(lab);
		if (playable) {
			const tag = document.createElement("span");
			tag.className = "match-tag";
			tag.textContent = "Tap to log ›";
			label.appendChild(tag);
		}
		card.appendChild(label);
		card.appendChild(renderSlot(match, 0));
		card.appendChild(renderSlot(match, 1));

		if (playable) {
			card.addEventListener("click", () => openResultDialog(match.id));
		}
		return card;
	}

	function renderRoundColumns(container, roundsIds, headFn) {
		container.innerHTML = "";
		roundsIds.forEach((ids, r) => {
			const col = document.createElement("div");
			col.className = "round-col";
			const head = document.createElement("div");
			head.className = "round-head";
			head.textContent = headFn(r, ids.length);
			col.appendChild(head);
			ids.forEach((id) => col.appendChild(renderMatch(state.matches[id])));
			container.appendChild(col);
		});
	}

	function wbHeadName(r, total) {
		if (state.format === "single") {
			if (r === state.rounds - 1) return "Final";
			if (r === state.rounds - 2) return "Semifinals";
			if (r === state.rounds - 3) return "Quarterfinals";
			return "Round " + (r + 1);
		}
		return r === state.rounds - 1 ? "WB Final" : "WB Round " + (r + 1);
	}

	function renderBracket() {
		el("formatBadge").textContent =
			(state.format === "double" ? "Double" : "Single") + " Elimination";

		// winners (or only) bracket
		el("wbTitle").textContent =
			state.format === "double" ? "Winners bracket" : "Bracket";
		renderRoundColumns(el("wbRounds"), state.wbOrder, wbHeadName);

		// losers bracket
		const lbSection = el("lbSection");
		if (state.lbOrder && state.lbOrder.length) {
			lbSection.hidden = false;
			renderRoundColumns(
				el("lbRounds"),
				state.lbOrder,
				(r) => "LB Round " + (r + 1)
			);
		} else {
			lbSection.hidden = true;
		}

		// grand final
		const gfSection = el("gfSection");
		if (state.grandFinalId) {
			gfSection.hidden = false;
			const gfIds = [[state.grandFinalId]];
			const gf2 = state.matches[state.grandFinalResetId];
			if (gf2 && (gf2.slots[0] || gf2.slots[1])) {
				gfIds.push([state.grandFinalResetId]);
			}
			renderRoundColumns(el("gfRounds"), gfIds, (r) =>
				r === 0 ? "Grand Final" : "Reset"
			);
		} else {
			gfSection.hidden = true;
		}

		// champion banner
		const banner = el("championBanner");
		if (state.champion) {
			banner.hidden = false;
			banner.innerHTML =
				'<span class="trophy">🏆</span><span class="ch-text"><small>Champion</small><strong></strong></span>';
			banner.querySelector("strong").textContent = playerName(state.champion);
		} else {
			banner.hidden = true;
		}
	}

	// ---------- result dialog ----------
	let pendingMatchId = null;
	let pendingWinner = null;

	function openResultDialog(matchId) {
		const m = state.matches[matchId];
		pendingMatchId = matchId;
		pendingWinner = null;
		resultTitle.textContent = "Log result";
		resultSub.textContent = m.label + " — tap the winner";
		pickList.innerHTML = "";

		[0, 1].forEach((idx) => {
			const pid = m.slots[idx].playerId;
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "pick-btn";
			btn.dataset.idx = idx;
			const seed = state.seeds[pid] || "";
			btn.innerHTML =
				'<span class="pick-seed">' +
				seed +
				'</span><span class="pick-nm"></span>' +
				'<input class="pick-score" inputmode="numeric" placeholder="—" ' +
				'aria-label="Score" /><span class="win-tick">✓ win</span>';
			btn.querySelector(".pick-nm").textContent = playerName(pid);

			const scoreInput = btn.querySelector(".pick-score");
			scoreInput.addEventListener("click", (e) => e.stopPropagation());
			scoreInput.addEventListener("keydown", (e) => e.stopPropagation());

			btn.addEventListener("click", () => {
				pendingWinner = idx;
				pickList
					.querySelectorAll(".pick-btn")
					.forEach((b) => b.classList.remove("selected"));
				btn.classList.add("selected");
				saveResultBtn.disabled = false;
			});
			pickList.appendChild(btn);
		});

		saveResultBtn.disabled = true;
		resultDialog.showModal();
	}

	resultForm.addEventListener("submit", (e) => {
		const val = e.submitter ? e.submitter.value : "cancel";
		if (val !== "save" || pendingWinner === null || pendingMatchId === null) {
			return; // cancel just closes
		}
		const btns = pickList.querySelectorAll(".pick-btn");
		const scores = [0, 1].map((i) => {
			const raw = btns[i].querySelector(".pick-score").value.trim();
			if (raw === "") return null;
			const num = parseInt(raw, 10);
			return isNaN(num) ? null : num;
		});
		const anyScore = scores.some((s) => s !== null);
		try {
			B.report(state, pendingMatchId, pendingWinner, anyScore ? scores : null);
			saveTournament();
			renderBracket();
		} catch (err) {
			console.error(err);
		}
		pendingMatchId = null;
		pendingWinner = null;
	});

	// ---------- top-level actions ----------
	newBtn.addEventListener("click", () => {
		confirmAction(
			"Start a new tournament?",
			"This clears the current bracket. Your player list is kept.",
			() => {
				state = null;
				localStorage.removeItem(TOURNEY_KEY);
				showSetup();
			}
		);
	});

	reseedBtn.addEventListener("click", () => {
		confirmAction(
			"Re-seed and restart?",
			"Players are reshuffled and all logged results are cleared.",
			() => {
				startTournament();
			}
		);
	});

	let confirmCb = null;
	function confirmAction(title, sub, cb) {
		el("confirmTitle").textContent = title;
		el("confirmSub").textContent = sub;
		confirmCb = cb;
		confirmDialog.showModal();
	}
	confirmDialog.addEventListener("close", () => {
		if (confirmDialog.returnValue === "ok" && confirmCb) confirmCb();
		confirmCb = null;
	});

	// ---------- view switching ----------
	function showSetup() {
		setupView.hidden = false;
		bracketView.hidden = true;
		newBtn.hidden = true;
		syncSetupControls();
		renderPlayers();
	}
	function showBracket() {
		setupView.hidden = true;
		bracketView.hidden = false;
		newBtn.hidden = false;
		renderBracket();
	}

	// ---------- persistence ----------
	function saveDraft() {
		localStorage.setItem(SETUP_KEY, JSON.stringify(draft));
	}
	function saveTournament() {
		localStorage.setItem(TOURNEY_KEY, JSON.stringify(state));
	}
	function loadJSON(key) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? JSON.parse(raw) : null;
		} catch (e) {
			return null;
		}
	}

	// ---------- boot ----------
	if (state && state.matches) {
		showBracket();
	} else {
		showSetup();
	}

	// service worker for offline / installability
	if ("serviceWorker" in navigator) {
		window.addEventListener("load", () => {
			navigator.serviceWorker.register("sw.js").catch(() => {});
		});
	}
})();
