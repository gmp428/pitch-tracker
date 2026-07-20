import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, zoneLabel, type Batter } from '../db'
import { pct } from '../lib/stats'
import { suggestPitch, TIER_LABELS } from '../lib/suggest'

export default function SuggestionPanel({ batter, currentPitcherId }: { batter: Batter; currentPitcherId?: number }) {
  const allPitches = useLiveQuery(() => db.pitches.toArray(), [])
  const allGames = useLiveQuery(() => db.games.toArray(), [])
  const allBatters = useLiveQuery(() => db.batters.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  if (!allPitches || !allGames || !allBatters || !pitchTypes) return null

  const result = suggestPitch({ allPitches, allGames, batter, allBatters, currentPitcherId })
  const typeName = (id: number) => pitchTypes.find((t) => t.id === id)?.name ?? '?'

  if (!result) {
    return (
      <div className="suggestion" style={{ borderLeftColor: 'var(--border)' }}>
        <div className="muted">No history on {batter.name} yet — data builds as you log pitches.</div>
      </div>
    )
  }

  const [best, ...rest] = result.ranked
  return (
    <div className="suggestion">
      <div className="head">
        Try: {typeName(best.pitchTypeId)}, {zoneLabel(best.zone)}{' '}
        <span className="good">{pct(best.rate)}</span>{' '}
        <span className="muted" style={{ fontWeight: 400 }}>({best.sample} pitches)</span>
      </div>
      {rest.length > 0 && (
        <div className="muted" style={{ marginTop: 4 }}>
          {rest.map((c) => `${typeName(c.pitchTypeId)} ${zoneLabel(c.zone)} ${pct(c.rate)}`).join(' · ')}
        </div>
      )}
      <div className="row spread" style={{ marginTop: 6 }}>
        <span className="pill">{TIER_LABELS[result.tier]}</span>
        <Link to={`/batter/${batter.id}`}>Full report ›</Link>
      </div>
    </div>
  )
}
