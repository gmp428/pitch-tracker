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

// Sort game ids newest-first by date (id breaks ties, higher = newer).
export function orderGamesNewestFirst(games: Game[]): number[] {
  return [...games]
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.id - a.id))
    .map((g) => g.id)
}

// The set of game ids to include for a window, based on the games in which
// these pitches actually occurred (e.g. a batter's most recent games with data).
// Returns null for 'all' (no filtering needed).
export function gameIdsForWindow(pitches: Pitch[], allGames: Game[], window: TimeWindow): Set<number> | null {
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

export function byPitchType(pitches: Pitch[]): Map<number, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitchTypeId)].map(([k, v]) => [k, aggregate(v)]))
}

export function byPitcher(pitches: Pitch[]): Map<number, Agg> {
  return new Map([...groupBy(pitches, (p) => p.pitcherId)].map(([k, v]) => [k, aggregate(v)]))
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}
