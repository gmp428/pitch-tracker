import Dexie, { type EntityTable } from 'dexie'

// ---------- Types ----------

export interface Opponent {
  id: number
  name: string
}

export interface Batter {
  id: number
  opponentId: number
  name: string
  number?: string
  bats: 'L' | 'R'
  notes?: string
}

export interface Pitcher {
  id: number
  name: string
  number?: string
  throws: 'L' | 'R'
  notes?: string
}

export interface PitchType {
  id: number
  name: string
  abbr: string
}

export interface Game {
  id: number
  opponentId: number
  date: string // ISO yyyy-mm-dd
  label?: string
  status: 'active' | 'finished'
  currentPitcherId?: number
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
  id: number
  gameId: number
  batterId: number
  pitcherId: number
  outcome?: AtBatOutcome
  startedAt: number
}

// Zones from the catcher's point of view.
// 1-9 are the strike zone (1 = up/left, 9 = down/right), o-* are out of the zone.
export type Zone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'o-up' | 'o-down' | 'o-left' | 'o-right'

export type PitchResult = 'ball' | 'called_strike' | 'swinging_strike' | 'foul' | 'in_play'

export type InPlayOutcome = 'out' | 'single' | 'double' | 'triple' | 'home_run' | 'error'

export interface Pitch {
  id: number
  gameId: number
  atBatId: number
  batterId: number
  pitcherId: number
  seq: number // 1-based pitch number within the at-bat
  balls: number // count BEFORE this pitch
  strikes: number
  pitchTypeId: number
  zone: Zone
  result: PitchResult
  inPlay?: InPlayOutcome
  ts: number
}

// ---------- Database ----------

export const db = new Dexie('pitch-tracker') as Dexie & {
  opponents: EntityTable<Opponent, 'id'>
  batters: EntityTable<Batter, 'id'>
  pitchers: EntityTable<Pitcher, 'id'>
  pitchTypes: EntityTable<PitchType, 'id'>
  games: EntityTable<Game, 'id'>
  atBats: EntityTable<AtBat, 'id'>
  pitches: EntityTable<Pitch, 'id'>
}

db.version(1).stores({
  opponents: '++id, name',
  batters: '++id, opponentId',
  pitchers: '++id, name',
  pitchTypes: '++id, name',
  games: '++id, opponentId, status',
  atBats: '++id, gameId, batterId, pitcherId',
  pitches: '++id, gameId, atBatId, batterId, pitcherId, ts',
})

const DEFAULT_PITCH_TYPES: Array<Omit<PitchType, 'id'>> = [
  { name: 'Fastball', abbr: 'FB' },
  { name: 'Changeup', abbr: 'CH' },
  { name: 'Drop ball', abbr: 'DR' },
  { name: 'Rise ball', abbr: 'RI' },
  { name: 'Curveball', abbr: 'CV' },
  { name: 'Screwball', abbr: 'SC' },
]

db.on('populate', async () => {
  await db.pitchTypes.bulkAdd(DEFAULT_PITCH_TYPES as PitchType[])
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
  version: 1
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
    version: 1,
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
