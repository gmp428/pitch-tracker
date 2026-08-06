import Dexie, { type EntityTable } from 'dexie'

// ---------- IDs & timestamps ----------
// Every row uses a globally-unique id (not an auto-increment integer) so the
// same record has the same id on every device — the foundation for syncing to
// a server later. `updatedAt` is stamped on every write for future sync/merge.

export const newId = (): string => crypto.randomUUID()
export const now = (): number => Date.now()

// ---------- Types ----------

export interface Opponent {
  id: string
  name: string
  updatedAt: number
}

export interface Batter {
  id: string
  opponentId: string
  name: string
  number?: string
  bats: 'L' | 'R'
  notes?: string
  updatedAt: number
}

export interface Pitcher {
  id: string
  name: string
  number?: string
  throws: 'L' | 'R'
  notes?: string
  // Pitch types this pitcher can throw. Undefined or empty = all pitch types
  // (covers pitchers created before arsenals existed).
  pitchTypeIds?: string[]
  updatedAt: number
}

export function pitcherArsenal(pitcher: Pitcher | undefined, allTypes: PitchType[]): PitchType[] {
  if (!pitcher?.pitchTypeIds || pitcher.pitchTypeIds.length === 0) return allTypes
  const allowed = new Set(pitcher.pitchTypeIds)
  const arsenal = allTypes.filter((t) => allowed.has(t.id))
  return arsenal.length > 0 ? arsenal : allTypes
}

export interface PitchType {
  id: string
  name: string
  abbr: string
  updatedAt: number
}

export interface Game {
  id: string
  opponentId: string
  date: string // ISO yyyy-mm-dd
  label?: string
  status: 'active' | 'finished'
  currentPitcherId?: string
  lineup?: string[] // ordered batterIds — the opponent's batting order for this game
  updatedAt: number
}

export type AtBatOutcome =
  | 'walk'
  | 'strikeout'
  | 'out'
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'error'

export interface AtBat {
  id: string
  gameId: string
  batterId: string
  pitcherId: string
  outcome?: AtBatOutcome
  startedAt: number
  updatedAt: number
}

// Zones from the catcher's point of view.
// 1-9 are the strike zone (1 = up/left, 9 = down/right), o-* are out of the zone.
export type Zone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'o-up' | 'o-down' | 'o-left' | 'o-right'

export type PitchResult = 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play'

export type InPlayOutcome = 'out' | 'single' | 'double' | 'triple' | 'home_run' | 'error'

export interface Pitch {
  id: string
  gameId: string
  atBatId: string
  batterId: string
  pitcherId: string
  seq: number // 1-based pitch number within the at-bat
  balls: number // count BEFORE this pitch
  strikes: number
  pitchTypeId: string
  zone: Zone
  result: PitchResult
  inPlay?: InPlayOutcome
  ts: number
  updatedAt: number
}

// ---------- Database ----------

// Primary keys are supplied by us (UUIDs), not auto-incremented. The database
// name is versioned (…-v2) because the id type changed from integers to
// strings; the old integer-keyed database is discarded (data was throwaway).
export const db = new Dexie('pitch-tracker-v2') as Dexie & {
  opponents: EntityTable<Opponent, 'id'>
  batters: EntityTable<Batter, 'id'>
  pitchers: EntityTable<Pitcher, 'id'>
  pitchTypes: EntityTable<PitchType, 'id'>
  games: EntityTable<Game, 'id'>
  atBats: EntityTable<AtBat, 'id'>
  pitches: EntityTable<Pitch, 'id'>
}

db.version(1).stores({
  opponents: 'id, name, updatedAt',
  batters: 'id, opponentId, updatedAt',
  pitchers: 'id, name, updatedAt',
  pitchTypes: 'id, name, updatedAt',
  games: 'id, opponentId, status, updatedAt',
  atBats: 'id, gameId, batterId, pitcherId, updatedAt',
  pitches: 'id, gameId, atBatId, batterId, pitcherId, ts, updatedAt',
})

// Discard the legacy integer-keyed database from before the UUID switch.
Dexie.delete('pitch-tracker').catch(() => {})

const DEFAULT_PITCH_TYPES: Array<Pick<PitchType, 'name' | 'abbr'>> = [
  { name: 'Fastball', abbr: 'FB' },
  { name: 'Changeup', abbr: 'CH' },
  { name: 'Drop ball', abbr: 'DR' },
  { name: 'Rise ball', abbr: 'RI' },
  { name: 'Curveball', abbr: 'CV' },
  { name: 'Screwball', abbr: 'SC' },
]

db.on('populate', async () => {
  await db.pitchTypes.bulkAdd(DEFAULT_PITCH_TYPES.map((t) => ({ ...t, id: newId(), updatedAt: now() })))
})

// ---------- Display helpers ----------

export const ZONES_IN: Zone[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const ZONES_OUT: Zone[] = ['o-up', 'o-down', 'o-left', 'o-right']

export function zoneLabel(zone: Zone): string {
  if (typeof zone === 'number') {
    const row = ['high', 'middle', 'low'][Math.floor((zone - 1) / 3)]
    const col = ['left', 'center', 'right'][(zone - 1) % 3]
    if (row === 'middle' && col === 'center') return 'middle-middle'
    return `${row}-${col}`
  }
  return { 'o-up': 'high (out of zone)', 'o-down': 'low (out of zone)', 'o-left': 'left (out of zone)', 'o-right': 'right (out of zone)' }[zone]
}

export function resultLabel(p: { result: PitchResult; inPlay?: InPlayOutcome }): string {
  switch (p.result) {
    case 'ball': return 'Ball'
    case 'called_strike': return 'Called strike'
    case 'swinging_strike': return 'Swinging strike'
    case 'foul': return 'Foul'
    case 'in_play': return `In play: ${outcomeLabel(p.inPlay!)}`
  }
}

export function outcomeLabel(o: AtBatOutcome | InPlayOutcome): string {
  return {
    walk: 'Walk', strikeout: 'Strikeout', out: 'Out', single: 'Single', double: 'Double',
    triple: 'Triple', home_run: 'Home run', error: 'Reached on error',
  }[o]
}

// ---------- Export / import ----------

export interface BackupFile {
  app: 'pitch-tracker'
  version: number
  exportedAt: string
  opponents: Opponent[]
  batters: Batter[]
  pitchers: Pitcher[]
  pitchTypes: PitchType[]
  games: Game[]
  atBats: AtBat[]
  pitches: Pitch[]
}

export async function exportAll(): Promise<BackupFile> {
  return {
    app: 'pitch-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    opponents: await db.opponents.toArray(),
    batters: await db.batters.toArray(),
    pitchers: await db.pitchers.toArray(),
    pitchTypes: await db.pitchTypes.toArray(),
    games: await db.games.toArray(),
    atBats: await db.atBats.toArray(),
    pitches: await db.pitches.toArray(),
  }
}

export async function importAll(data: BackupFile): Promise<void> {
  if (data.app !== 'pitch-tracker' || !Array.isArray(data.pitches)) {
    throw new Error('This file does not look like a Pitch Tracker backup.')
  }
  await db.transaction('rw', [db.opponents, db.batters, db.pitchers, db.pitchTypes, db.games, db.atBats, db.pitches], async () => {
    await Promise.all([
      db.opponents.clear(), db.batters.clear(), db.pitchers.clear(),
      db.pitchTypes.clear(), db.games.clear(), db.atBats.clear(), db.pitches.clear(),
    ])
    await db.opponents.bulkAdd(data.opponents)
    await db.batters.bulkAdd(data.batters)
    await db.pitchers.bulkAdd(data.pitchers)
    await db.pitchTypes.bulkAdd(data.pitchTypes)
    await db.games.bulkAdd(data.games)
    await db.atBats.bulkAdd(data.atBats)
    await db.pitches.bulkAdd(data.pitches)
  })
}

// ---------- Lineup ----------

// A game's default batting order: start from the most recent finished game's
// lineup for this opponent, drop batters no longer on the roster, then append
// any roster batters not already in it. Falls back to plain roster order.
export async function defaultLineup(opponentId: string): Promise<string[]> {
  const roster = await db.batters.where('opponentId').equals(opponentId).toArray()
  const rosterIds = roster.map((b) => b.id)
  const rosterSet = new Set(rosterIds)

  const games = await db.games.where('opponentId').equals(opponentId).toArray()
  const prev = games
    .filter((g) => g.status === 'finished' && g.lineup && g.lineup.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (!prev?.lineup) return rosterIds
  const kept = prev.lineup.filter((id) => rosterSet.has(id))
  const appended = rosterIds.filter((id) => !kept.includes(id))
  return [...kept, ...appended]
}
