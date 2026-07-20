import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, outcomeLabel } from '../db'
import ZoneGrid from '../components/ZoneGrid'
import {
  aggregate, byPitcher, byPitchType, byZone, filterByWindow, gameIdsForWindow,
  pct, successRate, WINDOW_LABELS, type TimeWindow,
} from '../lib/stats'

const WINDOWS: TimeWindow[] = ['last1', 'last3', 'all']

export default function BatterReport() {
  const { id } = useParams()
  const batterId = Number(id)

  const batter = useLiveQuery(() => db.batters.get(batterId), [batterId])
  const opponent = useLiveQuery(
    () => (batter ? db.opponents.get(batter.opponentId) : undefined),
    [batter?.opponentId],
  )
  const pitches = useLiveQuery(() => db.pitches.where('batterId').equals(batterId).toArray(), [batterId])
  const atBats = useLiveQuery(() => db.atBats.where('batterId').equals(batterId).toArray(), [batterId])
  const allGames = useLiveQuery(() => db.games.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])

  const [win, setWin] = useState<TimeWindow>('all')
  const [pitcherFilter, setPitcherFilter] = useState<number | 'all'>('all')

  if (!batter || !opponent || !pitches || !atBats || !allGames || !pitchers || !pitchTypes) return null

  const windowPitches = filterByWindow(pitches, allGames, win)
  const viewPitches = pitcherFilter === 'all'
    ? windowPitches
    : windowPitches.filter((p) => p.pitcherId === pitcherFilter)

  const overall = aggregate(viewPitches)
  const heat = byZone(viewPitches)
  const typeAggs = byPitchType(viewPitches)
  const matchups = byPitcher(windowPitches)

  const windowGameIds = gameIdsForWindow(pitches, allGames, win)
  const historyAtBats = atBats
    .filter((ab) => (windowGameIds === null || windowGameIds.has(ab.gameId)))
    .filter((ab) => (pitcherFilter === 'all' || ab.pitcherId === pitcherFilter))
    .filter((ab) => ab.outcome !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)

  const gameById = new Map(allGames.map((g) => [g.id, g]))
  const pitcherName = (pid: number) => pitchers.find((p) => p.id === pid)?.name ?? '?'

  return (
    <main>
      <h1>
        {batter.number ? `#${batter.number} ` : ''}{batter.name}{' '}
        <span className="pill">bats {batter.bats}</span>
      </h1>
      <p className="muted"><Link to={`/opponent/${opponent.id}`}>{opponent.name}</Link></p>

      <div className="chips">
        {WINDOWS.map((w) => (
          <button key={w} className={`chip ${win === w ? 'on' : ''}`} onClick={() => setWin(w)}>
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={`chip ${pitcherFilter === 'all' ? 'on' : ''}`} onClick={() => setPitcherFilter('all')}>
          All pitchers
        </button>
        {pitchers.filter((p) => matchups.has(p.id)).map((p) => (
          <button key={p.id} className={`chip ${pitcherFilter === p.id ? 'on' : ''}`} onClick={() => setPitcherFilter(p.id)}>
            vs {p.name}
          </button>
        ))}
      </div>

      {viewPitches.length === 0 ? (
        <p className="empty">No pitches logged for this view yet.</p>
      ) : (
        <>
          <div className="card row spread">
            <span>{overall.total} pitches</span>
            <span className="good">{pct(successRate(overall))} success</span>
            <span className={overall.hits > 0 ? 'bad' : 'muted'}>{overall.hits} hits</span>
          </div>

          <h2>Zone heat map</h2>
          <p className="muted">Green = strikes &amp; outs for us, red = they hit it. Number = pitches there.</p>
          <ZoneGrid heat={heat} />

          <h2>By pitch type</h2>
          <table>
            <thead>
              <tr><th>Pitch</th><th className="num">Thrown</th><th className="num">Whiffs</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {pitchTypes.filter((t) => typeAggs.has(t.id)).map((t) => {
                const a = typeAggs.get(t.id)!
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">{a.total}</td>
                    <td className="num">{a.whiffs}</td>
                    <td className="num">{a.hits}</td>
                    <td className="num">{pct(successRate(a))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {matchups.size > 0 && (
        <>
          <h2>Vs. my pitchers</h2>
          <p className="muted">Tap a row to filter this whole report to that matchup.</p>
          <table>
            <thead>
              <tr><th>Pitcher</th><th className="num">Pitches</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {[...matchups.entries()].map(([pid, a]) => (
                <tr
                  key={pid}
                  onClick={() => setPitcherFilter(pitcherFilter === pid ? 'all' : pid)}
                  style={{ cursor: 'pointer', background: pitcherFilter === pid ? 'var(--panel-2)' : undefined }}
                >
                  <td>{pitcherName(pid)}</td>
                  <td className="num">{a.total}</td>
                  <td className="num">{a.hits}</td>
                  <td className="num">{pct(successRate(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {historyAtBats.length > 0 && (
        <>
          <h2>At-bat history</h2>
          <div className="list">
            {historyAtBats.map((ab) => (
              <div key={ab.id} className="list-item">
                <span>{outcomeLabel(ab.outcome!)}</span>
                <span className="muted">vs {pitcherName(ab.pitcherId)}</span>
                <span className="chev">{gameById.get(ab.gameId)?.date ?? ''}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {batter.notes && <p className="card muted">📝 {batter.notes}</p>}
    </main>
  )
}
