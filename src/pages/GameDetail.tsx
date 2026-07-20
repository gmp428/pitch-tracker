import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, outcomeLabel, resultLabel, zoneLabel } from '../db'

export default function GameDetail() {
  const { id } = useParams()
  const gameId = Number(id)
  const navigate = useNavigate()

  const game = useLiveQuery(() => db.games.get(gameId), [gameId])
  const opponent = useLiveQuery(() => (game ? db.opponents.get(game.opponentId) : undefined), [game?.opponentId])
  const atBats = useLiveQuery(() => db.atBats.where('gameId').equals(gameId).toArray(), [gameId])
  const pitches = useLiveQuery(() => db.pitches.where('gameId').equals(gameId).toArray(), [gameId])
  const batters = useLiveQuery(() => db.batters.toArray(), [])
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])

  if (!game || !opponent || !atBats || !pitches || !batters || !pitchers || !pitchTypes) return null

  const ordered = [...atBats].sort((a, b) => a.startedAt - b.startedAt)

  const reopen = async () => {
    await db.games.update(gameId, { status: 'active' })
    navigate(`/game/${gameId}`)
  }

  return (
    <main>
      <h1>vs {opponent.name} <span className="muted">({game.date})</span></h1>
      <div className="row">
        <span className="pill">{pitches.length} pitches</span>
        <span className="pill">{ordered.length} at-bats</span>
        {game.status === 'finished'
          ? <button className="small" onClick={reopen}>Reopen game</button>
          : <Link to={`/game/${gameId}`} className="btn small">Back to live game</Link>}
      </div>

      {ordered.length === 0 && <p className="empty">Nothing logged in this game.</p>}

      {ordered.map((ab, i) => {
        const batter = batters.find((b) => b.id === ab.batterId)
        const pitcher = pitchers.find((p) => p.id === ab.pitcherId)
        const abPitches = pitches.filter((p) => p.atBatId === ab.id).sort((a, b) => a.seq - b.seq)
        return (
          <div key={ab.id} className="card">
            <div className="row spread">
              <strong>
                {i + 1}. <Link to={`/batter/${ab.batterId}`}>{batter?.name ?? '?'}</Link>
              </strong>
              <span>{ab.outcome ? outcomeLabel(ab.outcome) : 'In progress'}</span>
            </div>
            <div className="muted">pitched by {pitcher?.name ?? '?'}</div>
            <div className="stack" style={{ marginTop: 6 }}>
              {abPitches.map((p) => (
                <div key={p.id} className="muted">
                  {p.seq}. ({p.balls}-{p.strikes}) {pitchTypes.find((t) => t.id === p.pitchTypeId)?.name ?? '?'},{' '}
                  {zoneLabel(p.zone)} — {resultLabel(p)}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </main>
  )
}
