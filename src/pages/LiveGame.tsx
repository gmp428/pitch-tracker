import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, pitcherArsenal, resultLabel,
  type AtBatOutcome, type Batter, type InPlayOutcome, type Pitch, type PitchResult, type Zone,
} from '../db'
import ZoneGrid from '../components/ZoneGrid'
import SuggestionPanel from '../components/SuggestionPanel'

export default function LiveGame() {
  const { id } = useParams()
  const gameId = Number(id)
  const navigate = useNavigate()

  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  const opponent = useLiveQuery(
    () => (game ? db.opponents.get(game.opponentId) : undefined),
    [game?.opponentId],
  )
  const roster = useLiveQuery(
    () => (game ? db.batters.where('opponentId').equals(game.opponentId).toArray() : Promise.resolve([] as Batter[])),
    [game?.opponentId],
  )
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const openAtBat = useLiveQuery(
    () => db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first(),
    [gameId],
  )
  const abPitches = useLiveQuery(
    () => (openAtBat ? db.pitches.where('atBatId').equals(openAtBat.id).sortBy('seq') : Promise.resolve([] as Pitch[])),
    [openAtBat?.id],
  )
  const gamePitchCount = useLiveQuery(() => db.pitches.where('gameId').equals(gameId).count(), [gameId])

  const [selType, setSelType] = useState<number | null>(null)
  const [selZone, setSelZone] = useState<Zone | null>(null)
  const [showInPlay, setShowInPlay] = useState(false)

  // If a pitcher change removes the selected pitch type from the arsenal, clear it
  useEffect(() => {
    setSelType(null)
  }, [game?.currentPitcherId])

  if (!game || !opponent || !roster || !pitchers || !pitchTypes) return null

  const batter = openAtBat ? roster.find((b) => b.id === openAtBat.batterId) : undefined
  const currentPitcher = pitchers.find((p) => p.id === game.currentPitcherId)
  const arsenal = pitcherArsenal(currentPitcher, pitchTypes)

  // Replay the at-bat to get the current count (foul with 2 strikes doesn't add a strike)
  let balls = 0
  let strikes = 0
  for (const p of abPitches ?? []) {
    if (p.result === 'ball') balls++
    else if (p.result === 'foul') { if (strikes < 2) strikes++ }
    else if (p.result === 'called_strike' || p.result === 'swinging_strike') strikes++
  }

  const startAtBat = async (batterId: number) => {
    await db.atBats.add({
      gameId,
      batterId,
      pitcherId: game.currentPitcherId!,
      startedAt: Date.now(),
    })
    setSelType(null)
    setSelZone(null)
    setShowInPlay(false)
  }

  const commit = async (result: PitchResult, inPlay?: InPlayOutcome) => {
    if (!openAtBat || selType === null || selZone === null) return
    let outcome: AtBatOutcome | undefined
    if (result === 'ball' && balls + 1 >= 4) outcome = 'walk'
    else if ((result === 'called_strike' || result === 'swinging_strike') && strikes + 1 >= 3) outcome = 'strikeout'
    else if (result === 'in_play') outcome = inPlay

    await db.transaction('rw', db.pitches, db.atBats, async () => {
      await db.pitches.add({
        gameId,
        atBatId: openAtBat.id,
        batterId: openAtBat.batterId,
        pitcherId: game.currentPitcherId ?? openAtBat.pitcherId,
        seq: (abPitches?.length ?? 0) + 1,
        balls,
        strikes,
        pitchTypeId: selType,
        zone: selZone,
        result,
        inPlay,
        ts: Date.now(),
      })
      if (outcome) await db.atBats.update(openAtBat.id, { outcome })
    })
    setSelType(null)
    setSelZone(null)
    setShowInPlay(false)
  }

  const undo = async () => {
    await db.transaction('rw', db.pitches, db.atBats, async () => {
      const last = await db.pitches.where('gameId').equals(gameId).last()
      if (!last) {
        // No pitches yet — undo just backs out of the current batter selection
        const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
        if (open) await db.atBats.delete(open.id)
        return
      }
      // If a fresh (pitchless) at-bat was already started after the last pitch, remove it
      const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
      if (open && open.id !== last.atBatId) {
        const n = await db.pitches.where('atBatId').equals(open.id).count()
        if (n === 0) await db.atBats.delete(open.id)
      }
      await db.atBats.update(last.atBatId, { outcome: undefined })
      await db.pitches.delete(last.id)
    })
    setShowInPlay(false)
  }

  const endGame = async () => {
    if (!confirm('End this game?')) return
    // Discard an in-progress at-bat with no pitches
    const open = await db.atBats.where('gameId').equals(gameId).filter((ab) => ab.outcome === undefined).first()
    if (open) {
      const n = await db.pitches.where('atBatId').equals(open.id).count()
      if (n === 0) await db.atBats.delete(open.id)
    }
    await db.games.update(gameId, { status: 'finished' })
    navigate(`/games/${gameId}`)
  }

  const inPlayOptions: Array<[InPlayOutcome, string]> = [
    ['out', 'Out'], ['single', 'Single'], ['double', 'Double'],
    ['triple', 'Triple'], ['home_run', 'Home run'], ['error', 'Error'],
  ]

  return (
    <main>
      <div className="row spread">
        <h1 style={{ margin: '8px 0' }}>vs {opponent.name}</h1>
        <span className="muted">{gamePitchCount ?? 0} pitches</span>
      </div>

      <div className="row">
        <label style={{ margin: 0 }}>Pitching:</label>
        <select
          style={{ width: 'auto', flex: 1 }}
          value={game.currentPitcherId ?? ''}
          onChange={(e) => db.games.update(gameId, { currentPitcherId: Number(e.target.value) })}
        >
          {pitchers.map((p) => (
            <option key={p.id} value={p.id}>{p.number ? `#${p.number} ` : ''}{p.name}</option>
          ))}
        </select>
        <button className="small" onClick={undo} disabled={!gamePitchCount && !openAtBat}>↩ Undo</button>
      </div>

      {!openAtBat && (
        <>
          <h2>Who’s up to bat?</h2>
          {roster.length === 0 && (
            <p className="empty">No batters on {opponent.name}’s roster yet — add them from the team page.</p>
          )}
          <div className="list">
            {roster.map((b) => (
              <button key={b.id} className="list-item" onClick={() => startAtBat(b.id)} style={{ width: '100%' }}>
                <span>{b.number ? `#${b.number} ` : ''}{b.name}</span>
                <span className="pill">bats {b.bats}</span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
          <button className="danger" style={{ width: '100%', marginTop: 12 }} onClick={endGame}>End game</button>
        </>
      )}

      {openAtBat && batter && (
        <>
          <div className="card row spread">
            <div>
              <div style={{ fontWeight: 700 }}>{batter.number ? `#${batter.number} ` : ''}{batter.name}</div>
              <div className="muted">bats {batter.bats} · vs {currentPitcher?.name ?? '?'}</div>
            </div>
            <div className="count-display">{balls}-{strikes}</div>
          </div>

          <SuggestionPanel batter={batter} currentPitcherId={game.currentPitcherId} />

          <h3>1. Pitch type</h3>
          <div className="chips">
            {arsenal.map((t) => (
              <button key={t.id} className={`chip ${selType === t.id ? 'on' : ''}`} onClick={() => setSelType(t.id)}>
                {t.name}
              </button>
            ))}
          </div>

          <h3>2. Location</h3>
          <ZoneGrid selected={selZone} onSelect={setSelZone} />

          <h3>3. Result</h3>
          {selType === null || selZone === null ? (
            <p className="muted" style={{ textAlign: 'center' }}>Pick the pitch type and location first.</p>
          ) : !showInPlay ? (
            <div className="result-grid">
              <button onClick={() => commit('ball')}>Ball</button>
              <button onClick={() => commit('called_strike')}>Called strike</button>
              <button onClick={() => commit('swinging_strike')}>Swinging strike</button>
              <button onClick={() => commit('foul')}>Foul</button>
              <button className="wide primary" onClick={() => setShowInPlay(true)}>In play…</button>
            </div>
          ) : (
            <div className="result-grid">
              {inPlayOptions.map(([value, label]) => (
                <button key={value} onClick={() => commit('in_play', value)}>{label}</button>
              ))}
              <button className="wide" onClick={() => setShowInPlay(false)}>‹ Back</button>
            </div>
          )}

          {(abPitches?.length ?? 0) > 0 && (
            <>
              <h3>This at-bat</h3>
              <div className="stack">
                {abPitches!.map((p) => (
                  <div key={p.id} className="muted">
                    {p.seq}. {pitchTypes.find((t) => t.id === p.pitchTypeId)?.name ?? '?'} — {resultLabel(p)}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  )
}
