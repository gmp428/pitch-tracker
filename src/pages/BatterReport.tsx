import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, displayName, fullName, outcomeLabel } from '../db'
import ZoneGrid from '../components/ZoneGrid'
import {
  aggregate, byCount, byPitcher, byPitchType, byZoneBattle, filterByWindow,
  gameIdsForWindow, isHit, pct, plateDiscipline, successRate, WINDOW_LABELS, type TimeWindow,
} from '../lib/stats'

const WINDOWS: TimeWindow[] = ['last1', 'last3', 'all']

export default function BatterReport() {
  const { id } = useParams()
  const batterId = id!
  const navigate = useNavigate()

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
  const [pitcherFilter, setPitcherFilter] = useState<string | 'all'>('all')

  if (!batter || !opponent || !pitches || !atBats || !allGames || !pitchers || !pitchTypes) return null

  const windowPitches = filterByWindow(pitches, allGames, win)
  const viewPitches = pitcherFilter === 'all'
    ? windowPitches
    : windowPitches.filter((p) => p.pitcherId === pitcherFilter)

  const overall = aggregate(viewPitches)
  const heat = byZoneBattle(viewPitches)
  const typeAggs = byPitchType(viewPitches)
  const matchups = byPitcher(windowPitches)
  const discipline = plateDiscipline(viewPitches)
  const countRows = byCount(viewPitches)
  const rate = (r: number | null) => (r === null ? '—' : pct(r))

  const windowGameIds = gameIdsForWindow(pitches, allGames, win)
  const historyAtBats = atBats
    .filter((ab) => (windowGameIds === null || windowGameIds.has(ab.gameId)))
    .filter((ab) => (pitcherFilter === 'all' || ab.pitcherId === pitcherFilter))
    .filter((ab) => ab.outcome !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)

  const gameById = new Map(allGames.map((g) => [g.id, g]))
  const pitcherName = (pid: string) => displayName(pitchers.find((p) => p.id === pid))

  return (
    <main>
      <button className="small" style={{ marginTop: 10 }} onClick={() => navigate(-1)}>‹ Back</button>
      <h1>
        {batter.number ? `#${batter.number} ` : ''}{fullName(batter)}{' '}
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
            vs {displayName(p)}
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
          <p className="muted">Green = our pitch won (strikes, fouls, outs), red = they hit it. Number = pitches there.</p>
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

          <h2>Plate discipline</h2>
          <div className="row" style={{ gap: 8 }}>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.chasePct)}</div><div className="muted">Chase</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.whiffPct)}</div><div className="muted">Whiff</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.zonePct)}</div><div className="muted">In zone</div></div>
            <div className="card stat-tile"><div className="stat-num">{rate(discipline.firstPitchStrikePct)}</div><div className="muted">1st-pitch K</div></div>
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            Chase = swings at pitches out of the zone · Whiff = swings and misses.
          </p>

          <h2>By count</h2>
          <table>
            <thead>
              <tr><th>Count</th><th className="num">Seen</th><th className="num">Whiff%</th><th className="num">Chase%</th><th className="num">Hits</th></tr>
            </thead>
            <tbody>
              {countRows.map(({ key, pitches: cp }) => {
                const d = plateDiscipline(cp)
                const hits = cp.filter(isHit).length
                return (
                  <tr key={key}>
                    <td>{key}</td>
                    <td className="num">{cp.length}</td>
                    <td className="num">{rate(d.whiffPct)}</td>
                    <td className="num">{rate(d.chasePct)}</td>
                    <td className={`num ${hits > 0 ? 'bad' : ''}`}>{hits}</td>
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
