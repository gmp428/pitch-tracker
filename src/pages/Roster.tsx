import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export default function Roster() {
  const { id } = useParams()
  const opponentId = Number(id)
  const navigate = useNavigate()
  const opponent = useLiveQuery(() => db.opponents.get(opponentId), [opponentId])
  const batters = useLiveQuery(() => db.batters.where('opponentId').equals(opponentId).toArray(), [opponentId])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [bats, setBats] = useState<'L' | 'R'>('R')

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setNumber('')
    setBats('R')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingId !== null) {
      await db.batters.update(editingId, { name: trimmed, number: number.trim(), bats })
    } else {
      await db.batters.add({ opponentId, name: trimmed, number: number.trim(), bats })
    }
    resetForm()
  }

  const startEdit = (batterId: number) => {
    const b = batters?.find((x) => x.id === batterId)
    if (!b) return
    setEditingId(batterId)
    setName(b.name)
    setNumber(b.number ?? '')
    setBats(b.bats)
  }

  const removeBatter = async (batterId: number) => {
    const pitchCount = await db.pitches.where('batterId').equals(batterId).count()
    if (pitchCount > 0) {
      alert(`This batter has ${pitchCount} logged pitches. Delete is blocked to protect your data.`)
      return
    }
    if (confirm('Delete this batter?')) await db.batters.delete(batterId)
  }

  const removeTeam = async () => {
    const gameCount = await db.games.where('opponentId').equals(opponentId).count()
    if (gameCount > 0) {
      alert('This team has logged games, so it can’t be deleted.')
      return
    }
    if (!confirm(`Delete ${opponent?.name} and their roster?`)) return
    await db.batters.where('opponentId').equals(opponentId).delete()
    await db.opponents.delete(opponentId)
    navigate('/')
  }

  if (!opponent || !batters) return null

  return (
    <main>
      <h1>{opponent.name}</h1>
      <p className="muted">Tap a batter to see their scouting report.</p>

      <div className="list">
        {batters.map((b) => (
          <div key={b.id} className="list-item">
            <Link to={`/batter/${b.id}`} className="grow" style={{ color: 'var(--text)' }}>
              {b.number ? `#${b.number} ` : ''}{b.name} <span className="pill">bats {b.bats}</span>
            </Link>
            <button className="small" onClick={() => startEdit(b.id)}>Edit</button>
            <button className="small danger" onClick={() => removeBatter(b.id)}>✕</button>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="card stack">
        <strong>{editingId !== null ? 'Edit batter' : 'Add batter'}</strong>
        <div className="row">
          <div className="grow">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Batter name" />
          </div>
          <div style={{ width: 80 }}>
            <label>#</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12" inputMode="numeric" />
          </div>
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>Bats:</label>
          <button type="button" className={`chip ${bats === 'R' ? 'on' : ''}`} onClick={() => setBats('R')}>Right</button>
          <button type="button" className={`chip ${bats === 'L' ? 'on' : ''}`} onClick={() => setBats('L')}>Left</button>
        </div>
        <div className="row">
          <button type="submit" className="primary grow">{editingId !== null ? 'Save changes' : 'Add batter'}</button>
          {editingId !== null && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <button className="danger" onClick={removeTeam} style={{ marginTop: 20 }}>Delete team</button>
    </main>
  )
}
