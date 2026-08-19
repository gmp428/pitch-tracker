import type { Game, Pitch, Zone } from '../db'

// A pitch is a "success" for us when it got a called strike, a swing-and-miss,
// or was put in play for an out.
export function isSuccess(p: Pitch): boolean {
  if (p.result === 'called_strike' || p.result === 'swinging_strike') return true
  if (p.result === 'in_play') return p.inPlay === 'out'
  return false
}

export function isHit(p: Pitch): boolean {
  return p.result === 'in_play' && (p.inPlay === 'single' || p.inPlay === 'double' || p.inPlay === 'triple' || p.inPlay === 'home_run')
}

// The batter offered at the pitch (swung).
export function isSwing(p: Pitch): boolean {
  return p.result === 'swinging_strike' || p.result === 'foul' || p.result === 'in_play'
}

// Out-of-zone pitches use the string zone regions (o-up/o-down/o-left/o-right);
// in-zone pitches use the numeric 1–9 grid.
export function isOutOfZone(p: Pitch): boolean {
  return typeof p.zone === 'string'
}

export interface Agg {
  total: number
  balls: number
  calledStrikes: number
  whiffs: number
  fouls: number
  inPlayOuts: number
  hits: number
  errors: number
}

export function aggregate(pitches: Pitch[]): Agg {
  const a: Agg = { total: 0, balls: 0, calledStrikes: 0, whiffs: 0, fouls: 0, inPlayOuts: 0, hits: 0, errors: 0 }
  for (const p of pitches) {
    a.total++
    if (p.result === 'ball') a.balls++
    else if (p.result === 'called_strike') a.calledStrikes++
    else if (p.result === 'swinging_strike') a.whiffs++
    else if (p.result === 'foul') a.fouls++
    else if (p.result === 'in_play') {
      if (p.inPlay === 'out') a.inPlayOuts++
      else if (p.inPlay === 'error') a.errors++
      else a.hits++
    }
  }
  return a
}

export function successRate(a: Agg): number {
  return a.total === 0 ? 0 : (a.calledStrikes + a.whiffs + a.inPlayOuts) / a.total
}

// ---------- Time windows ----------

export type TimeWindow = 'last1' | 'last3' | 'all'

export const WINDOW_LABELS: Record<TimeWindow, string> = {
  last1: 'Last game',
  last3: 'Last 3 games',
  all: 'Overall',
}

// Sort game ids newest-first by date (updatedAt breaks ties, higher = newer).
export function orderGamesNewestFirst(games: Game[]): string[] {
  return [...games]
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.updatedAt - a.updatedAt))
    .map((g) => g.id)
}

// The set of game ids to include for a window, based on the games in which
// these pitches actually occurred (e.g. a batter's most recent games with data).
// Returns null for 'all' (no filtering needed).
export function gameIdsForWindow(pitches: Pitch[], allGames: Game[], window: TimeWindow): Set<string> | null {
  if (window === 'all') return null
  const withData = new Set(pitches.map((p) => p.gameId))
  const ordered = orderGamesNewestFirst(allGames.filter((g) => withData.has(g.id)))
  return new Set(ordered.slice(0, window === 'last1' ? 1 : 3))
}

export function filterByWindow(pitches: Pitch[], allGames: Game[], window: TimeWindow): Pitch[] {
  const ids = gameIdsForWindow(pitches, allGames, window)
  return ids === null ? pitches : pitches.filter((p) => ids.has(p.gameId))
}

// ---------- Groupings ----------

function groupBy<K>(pitches: Pitch[], key: (p: Pitch) => K): Map<K, Pitch[]> {
  const m = new Map<K, Pitch[]>()
  for (const p of pitches) {
    const k = key(p)
    const arr = m.get(k)
    if (arr) arr.push(p)
    else m.set(k, [p])
  }
  return m
}

export function byZone(pitches: Pitch[]): Map<Zone, Agg> {
  return new Map([...groupBy(pitches, (p) => p.zone)].map(([k, v]) => [k, aggregate(v)]))
}

export function byPitchType(pitches: Pitch[]): Map<string, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitchTypeId)].map(([k, v]) => [k, aggregate(v)]))
}

export function byPitcher(pitches: Pitch[]): Map<string, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitcherId)].map(([k, v]) => [k, aggregate(v)]))
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

// ---------- "Battle" view: who won the pitch ----------
// good = we won it (called strike, whiff, foul, in-play out)
// bad  = they won it (hit, reached on error)
// balls are neutral (neither side "won" the pitch)

export interface BattleAgg {
  good: number
  bad: number
  balls: number
  total: number
}

export function battleAgg(pitches: Pitch[]): BattleAgg {
  const a: BattleAgg = { good: 0, bad: 0, balls: 0, total: 0 }
  for (const p of pitches) {
    a.total++
    // Balls and hit-by-pitches are neutral — not a strike, but the batter
    // didn't win the pitch off contact either.
    if (p.result === 'ball' || p.result === 'hbp') a.balls++
    else if (p.result === 'in_play' && p.inPlay !== 'out') a.bad++
    else a.good++
  }
  return a
}

// null when there's nothing decisive to rate (only balls, or no pitches)
export function battleRate(a: BattleAgg): number | null {
  return a.good + a.bad === 0 ? null : a.good / (a.good + a.bad)
}

export function byZoneBattle(pitches: Pitch[]): Map<Zone, BattleAgg> {
  const m = new Map<Zone, Pitch[]>()
  for (const p of pitches) {
    const arr = m.get(p.zone)
    if (arr) arr.push(p)
    else m.set(p.zone, [p])
  }
  return new Map([...m].map(([k, v]) => [k, battleAgg(v)]))
}

// ---------- Outcome breakdown for the per-pitch stat buttons ----------

export interface OutcomeSlice {
  label: string
  count: number
  pct: number // 0..1 of all pitches in the group
}

export function outcomeBreakdown(pitches: Pitch[]): OutcomeSlice[] {
  if (pitches.length === 0) return []
  const buckets: Record<string, number> = {}
  const bump = (label: string) => { buckets[label] = (buckets[label] ?? 0) + 1 }
  for (const p of pitches) {
    if (p.result === 'ball') bump('Ball')
    else if (p.result === 'called_strike') bump('Called K')
    else if (p.result === 'swinging_strike') bump('Whiff')
    else if (p.result === 'foul') bump('Foul')
    else if (p.result === 'hbp') bump('HBP')
    else if (p.inPlay === 'out') bump('Out')
    else bump('Hit')
  }
  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count, pct: count / pitches.length }))
    .sort((a, b) => b.count - a.count)
}

// ---------- Plate discipline & count splits ----------

export interface PlateDiscipline {
  seen: number
  chasePct: number | null // swings at out-of-zone / out-of-zone seen
  whiffPct: number | null // swinging strikes / swings
  zonePct: number | null // in-zone / seen
  calledStrikePct: number | null // called strikes / seen
  firstPitchStrikePct: number | null // 0-0 strikes / 0-0 seen
}

export function plateDiscipline(pitches: Pitch[]): PlateDiscipline {
  let seen = 0, inZone = 0, oozSeen = 0, oozSwings = 0
  let swings = 0, whiffs = 0, called = 0
  let firstSeen = 0, firstStrikes = 0
  for (const p of pitches) {
    seen++
    if (isOutOfZone(p)) { oozSeen++; if (isSwing(p)) oozSwings++ } else inZone++
    if (isSwing(p)) swings++
    if (p.result === 'swinging_strike') whiffs++
    if (p.result === 'called_strike') called++
    if (p.balls === 0 && p.strikes === 0) {
      firstSeen++
      // strike = anything not a ball or hit-by-pitch
      if (p.result !== 'ball' && p.result !== 'hbp') firstStrikes++
    }
  }
  const rate = (num: number, den: number) => (den === 0 ? null : num / den)
  return {
    seen,
    chasePct: rate(oozSwings, oozSeen),
    whiffPct: rate(whiffs, swings),
    zonePct: rate(inZone, seen),
    calledStrikePct: rate(called, seen),
    firstPitchStrikePct: rate(firstStrikes, firstSeen),
  }
}

export function countKey(p: Pitch): string {
  return `${p.balls}-${p.strikes}`
}

// Pitches grouped by the count they were thrown on, ordered balls-then-strikes.
export function byCount(pitches: Pitch[]): Array<{ key: string; pitches: Pitch[] }> {
  const m = new Map<string, Pitch[]>()
  for (const p of pitches) {
    const k = countKey(p)
    const arr = m.get(k)
    if (arr) arr.push(p)
    else m.set(k, [p])
  }
  return [...m.entries()]
    .map(([key, ps]) => ({ key, pitches: ps }))
    .sort((a, b) => {
      const [ab, as_] = a.key.split('-').map(Number)
      const [bb, bs] = b.key.split('-').map(Number)
      return ab - bb || as_ - bs
    })
}
