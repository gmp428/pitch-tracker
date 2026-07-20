import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import ZoneGrid from '../components/ZoneGrid'
import {
  aggregate, byPitchType, byZone, filterByWindow, pct, successRate,
  WINDOW_LABELS, type TimeWindow,
} from '../lib/stats'

const WINDOWS: TimeWindow[] = ['last1', 'last3', 'all']

export default function PitcherReport() {
  const { id } = useParams()
  const pitcherId = Number(id)

  const pitcher = useLiveQuery(() => db.pitchers.get(pitcherId), [pitcherId])
  const pitches = useLiveQuery(() => db.pitches.where('pitcherId').equals(pitcherId).toArray(), [pitcherId])
  const allGames = useLiveQuery(() => db.games.toArray(), [])
  const allBatters = useLiveQuery(() => db.batters.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])

  const [win, setWin] = useState<TimeWindow>('all')

  if (!pitcher || !pitches || !allGames || !allBatters || !pitchTypes) return null

  const viewPitches = filterByWindow(pitches, allGames, win)
  const overall = aggregate(viewPitches)
  const typeAggs = byPitchType(viewPitches)
  const heat = byZone(viewPitches)

  // Per-batter results for this pitcher
  const byBatter = new Map<number, typeof overall>()
  for (const batterId of new Set(viewPitches.map((p) => p.batterId))) {
    byBatter.set(batterId, aggregate(viewPitches.filter((p) => p.batterId === batterId)))
  }

  return (
    <main>
      <h1>
        {pitcher.number ? `#${pitcher.number} ` : ''}{pitcher.name}{' '}
        <span className="pill">throws {pitcher.throws}</span>
      </h1>
      {pitcher.notes && <p className="muted">📝 {pitcher.notes}</p>}

      <div className="chips">
        {WINDOWS.map((w) => (
          <button key={w} className={`chip ${win === w ? 'on' : ''}`} onClick={() => setWin(w)}>
            {WINDOW_LABELS[w]}
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
            <span className={overall.hits > 0 ? 'bad' : 'muted'}>{overall.hits} hits allowed</span>
          </div>

          <h2>Locations</h2>
          <ZoneGrid heat={heat} />

          <h2>Pitch mix</h2>
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

          <h2>Batters faced</h2>
          <table>
            <thead>
              <tr><th>Batter</th><th className="num">Pitches</th><th className="num">Hits</th><th className="num">Success</th></tr>
            </thead>
            <tbody>
              {[...byBatter.entries()].map(([bid, a]) => {
                const b = allBatters.find((x) => x.id === bid)
                return (
                  <tr key={bid}>
                    <td><Link to={`/batter/${bid}`}>{b?.name ?? '?'}</Link></td>
                    <td className="num">{a.total}</td>
                    <td className="num">{a.hits}</td>
                    <td className="num">{pct(successRate(a))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
