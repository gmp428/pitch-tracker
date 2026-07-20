import type { Batter, Game, Pitch, Zone } from '../db'
import { isSuccess, orderGamesNewestFirst } from './stats'

// Which pool of data a suggestion was computed from, in priority order:
//   vs-pitcher: this batter against the current pitcher (best signal)
//   vs-batter:  this batter against any of our pitchers
//   same-hand:  all batters with the same handedness (weakest fallback)
export type Tier = 'vs-pitcher' | 'vs-batter' | 'same-hand'

export const TIER_LABELS: Record<Tier, string> = {
  'vs-pitcher': 'vs. this pitcher',
  'vs-batter': 'vs. this batter (all pitchers)',
  'same-hand': 'same-handed batters (little data on this batter)',
}

export interface Combo {
  pitchTypeId: number
  zone: Zone
  sample: number // raw number of pitches behind this suggestion
  rate: number // recency-weighted success rate, 0..1
}

export interface SuggestionResult {
  tier: Tier
  ranked: Combo[] // best first, up to 3
}

const MIN_SAMPLE = 2

// Recent games count a bit more: most recent game 2x, next two 1.5x, older 1x.
function recencyWeight(gameRecency: Map<number, number>, gameId: number): number {
  const idx = gameRecency.get(gameId)
  if (idx === undefined) return 1
  if (idx === 0) return 2
  if (idx <= 2) return 1.5
  return 1
}

function rankCombos(pitches: Pitch[], gameRecency: Map<number, number>): Combo[] {
  const byCombo = new Map<string, Pitch[]>()
  for (const p of pitches) {
    const k = `${p.pitchTypeId}|${p.zone}`
    const arr = byCombo.get(k)
    if (arr) arr.push(p)
    else byCombo.set(k, [p])
  }
  const combos: Combo[] = []
  for (const group of byCombo.values()) {
    if (group.length < MIN_SAMPLE) continue
    let wTotal = 0
    let wSuccess = 0
    for (const p of group) {
      const w = recencyWeight(gameRecency, p.gameId)
      wTotal += w
      if (isSuccess(p)) wSuccess += w
    }
    combos.push({
      pitchTypeId: group[0].pitchTypeId,
      zone: group[0].zone,
      sample: group.length,
      rate: wSuccess / wTotal,
    })
  }
  return combos.sort((a, b) => b.rate - a.rate || b.sample - a.sample).slice(0, 3)
}

export function suggestPitch(args: {
  allPitches: Pitch[]
  allGames: Game[]
  batter: Batter
  allBatters: Batter[]
  currentPitcherId?: number
}): SuggestionResult | null {
  const { allPitches, allGames, batter, allBatters, currentPitcherId } = args
  const gameRecency = new Map(orderGamesNewestFirst(allGames).map((id, i) => [id, i]))

  // Tier 1: this batter vs. the current pitcher
  if (currentPitcherId !== undefined) {
    const t1 = allPitches.filter((p) => p.batterId === batter.id && p.pitcherId === currentPitcherId)
    const ranked = rankCombos(t1, gameRecency)
    if (ranked.length > 0) return { tier: 'vs-pitcher', ranked }
  }

  // Tier 2: this batter vs. anyone
  const t2 = allPitches.filter((p) => p.batterId === batter.id)
  const ranked2 = rankCombos(t2, gameRecency)
  if (ranked2.length > 0) return { tier: 'vs-batter', ranked: ranked2 }

  // Tier 3: all batters with the same handedness
  const sameHand = new Set(allBatters.filter((b) => b.bats === batter.bats).map((b) => b.id))
  const t3 = allPitches.filter((p) => sameHand.has(p.batterId))
  const ranked3 = rankCombos(t3, gameRecency)
  if (ranked3.length > 0) return { tier: 'same-hand', ranked: ranked3 }

  return null
}
