import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, pitcherArsenal, resultLabel,
  type AtBatOutcome, type Batter, type InPlayOutcome, type Pitch, type PitchResult, type Zone,
} from '../db'
import ZoneGrid from '../components/ZoneGrid'
import SuggestionPanel from '../components/SuggestionPanel'
import { battleAgg, battleRate, byZoneBattle, outcomeBreakdown, pct } from '../lib/stats'

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
  // All history on the current batter, live-updating as pitches are logged
  const batterHistory = useLiveQuery(
    () => (openAtBat ? db.pitches.where('batterId').equals(openAtBat.batterId).toArray() : Promise.resolve([] as Pitch[])),
    [openAtBat?.batterId],
  )

  const [selType, setSelType] = useState<number | null>(null)
  const [selZone, setSelZone] = useState<Zone | null>(null)
  const [showInPlay, setShowInPlay] = useState(false)
  // Which history pool the in-game stats draw from
  const [scope, setScope] = useState<'all' | 'pitcher'>('all')
  // Showing the "wrong batter — switch to…" picker
  const [changingBatter, setChangingBatter] = useState(false)

  // If a pitcher change removes the selected pitch type from the arsenal, clear it
  useEffect(() => {
    setSelType(null)
  }, [game?.currentPitcherId])

  // Fresh batter: reset the stat scope and close the switch-batter picker
  useEffect(() => {
    setScope('all')
    setChangingBatter(false)
  }, [openAtBat?.batterId])

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

  // Reassign the current at-bat (and any pitches already logged in it) to a
  // different batter — for when the wrong batter was picked.
  const switchBatter = async (newBatterId: number) => {
    if (!openAtBat || newBatterId === openAtBat.batterId) {
      setChangingBatter(false)
      return
    }
    await db.transaction('rw', db.atBats, db.pitches, async () => {
      await db.atBats.update(openAtBat.id, { batterId: newBatterId })
      await db.pitches.where('atBatId').equals(openAtBat.id).modify({ batterId: newBatterId })
    })
    setChangingBatter(false)
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

      {openAtBat && batter && (() => {
        // Scope the batter's history to the chosen pool
        const history = batterHistory ?? []
        const scoped = scope === 'pitcher'
          ? history.filter((p) => p.pitcherId === game.currentPitcherId)
          : history
        const vsPitcherCount = history.filter((p) => p.pitcherId === game.currentPitcherId).length
        const heatPitches = selType !== null ? scoped.filter((p) => p.pitchTypeId === selType) : []
        const heat = heatPitches.length > 0 ? byZoneBattle(heatPitches) : undefined
        return (
        <>
          <div className="card">
            <div className="row spread">
              <div>
                <div style={{ fontWeight: 700 }}>{batter.number ? `#${batter.number} ` : ''}{batter.name}</div>
                <div className="muted">bats {batter.bats} · vs {currentPitcher?.name ?? '?'}</div>
              </div>
              <div className="count-display">{balls}-{strikes}</div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="small" onClick={() => setChangingBatter((v) => !v)}>
                {changingBatter ? 'Cancel' : '↔ Wrong batter?'}
              </button>
              {history.length > 0 && (
                <>
                  <button
                    className={`chip small-chip ${scope === 'all' ? 'on' : ''}`}
                    onClick={() => setScope('all')}
                  >
                    All pitchers ({history.length})
                  </button>
                  <button
                    className={`chip small-chip ${scope === 'pitcher' ? 'on' : ''}`}
                    onClick={() => setScope('pitcher')}
                    disabled={vsPitcherCount === 0}
                  >
                    vs {currentPitcher?.name ?? '?'} ({vsPitcherCount})
                  </button>
                </>
              )}
            </div>
          </div>

          {changingBatter && (
            <div className="card stack">
              <strong>Switch this at-bat to…</strong>
              <div className="list">
                {roster.map((b) => (
                  <button
                    key={b.id}
                    className="list-item"
                    style={{ width: '100%' }}
                    disabled={b.id === batter.id}
                    onClick={() => switchBatter(b.id)}
                  >
                    <span>{b.number ? `#${b.number} ` : ''}{b.name}</span>
                    <span className="pill">bats {b.bats}</span>
                    {b.id === batter.id ? <span className="chev">current</span> : <span className="chev">›</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SuggestionPanel batter={batter} currentPitcherId={game.currentPitcherId} />

          {selType === null ? (
            <>
              <h3>1. Pitch type {scoped.length > 0 && <span className="muted" style={{ textTransform: 'none' }}>— {batter.name}’s history per pitch</span>}</h3>
              <div className="stack">
                {arsenal.map((t) => {
                  const tp = scoped.filter((p) => p.pitchTypeId === t.id)
                  const rate = battleRate(battleAgg(tp))
                  const top3 = outcomeBreakdown(tp).slice(0, 3)
                  return (
                    <button
                      key={t.id}
                      className="pitch-stat"
                      onClick={() => setSelType(t.id)}
                    >
                      <span className="row spread">
                        <strong>{t.name}</strong>
                        <span className="muted">{tp.length > 0 ? `${tp.length} seen` : 'no data'}</span>
                      </span>
                      {rate !== null && (
                        <span className="winbar" aria-hidden="true">
                          <span style={{ width: `${Math.round(rate * 100)}%` }} />
                        </span>
                      )}
                      {top3.length > 0 && (
                        <span className="muted breakdown">
                          {top3.map((s) => `${s.label} ${pct(s.pct)}`).join(' · ')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="row spread selected-pitch">
              <span><span className="muted">Pitch:</span> <strong>{pitchTypes.find((t) => t.id === selType)?.name}</strong></span>
              <button className="small" onClick={() => { setSelType(null); setSelZone(null); setShowInPlay(false) }}>Change pitch</button>
            </div>
          )}

          {selType !== null && (
          <>
          <h3>2. Location {heat && <span className="muted" style={{ textTransform: 'none' }}>— where this pitch has worked</span>}</h3>
          <ZoneGrid selected={selZone} onSelect={setSelZone} heat={heat} />
          {heat && (
            <p className="muted" style={{ textAlign: 'center', margin: '0 0 8px' }}>
              Green = our pitch won · red = they hit it · number = pitches there
            </p>
          )}

          <h3>3. Result</h3>
          {selZone === null ? (
            <p className="muted" style={{ textAlign: 'center' }}>Tap where the pitch went above.</p>
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
          </>
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
        )
      })()}
    </main>
  )
}
