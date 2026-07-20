import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export default function Pitchers() {
  const pitchers = useLiveQuery(() => db.pitchers.toArray(), [])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [throws, setThrows] = useState<'L' | 'R'>('R')
  const [notes, setNotes] = useState('')

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setNumber('')
    setThrows('R')
    setNotes('')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (editingId !== null) {
      await db.pitchers.update(editingId, { name: trimmed, number: number.trim(), throws, notes: notes.trim() })
    } else {
      await db.pitchers.add({ name: trimmed, number: number.trim(), throws, notes: notes.trim() })
    }
    resetForm()
  }

  const startEdit = (pitcherId: number) => {
    const p = pitchers?.find((x) => x.id === pitcherId)
    if (!p) return
    setEditingId(pitcherId)
    setName(p.name)
    setNumber(p.number ?? '')
    setThrows(p.throws)
    setNotes(p.notes ?? '')
  }

  const remove = async (pitcherId: number) => {
    const pitchCount = await db.pitches.where('pitcherId').equals(pitcherId).count()
    if (pitchCount > 0) {
      alert(`This pitcher has ${pitchCount} logged pitches. Delete is blocked to protect your data.`)
      return
    }
    if (confirm('Delete this pitcher?')) await db.pitchers.delete(pitcherId)
  }

  if (!pitchers) return null

  return (
    <main>
      <h1>My pitchers</h1>
      <p className="muted">Tap a pitcher to see their stats and batter matchups.</p>

      {pitchers.length === 0 && (
        <p className="empty">Add your pitching staff. Every pitch you log is credited to whoever is in the circle.</p>
      )}

      <div className="list">
        {pitchers.map((p) => (
          <div key={p.id} className="list-item">
            <Link to={`/pitcher/${p.id}`} className="grow" style={{ color: 'var(--text)' }}>
              {p.number ? `#${p.number} ` : ''}{p.name} <span className="pill">throws {p.throws}</span>
            </Link>
            <button className="small" onClick={() => startEdit(p.id)}>Edit</button>
            <button className="small danger" onClick={() => remove(p.id)}>✕</button>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="card stack">
        <strong>{editingId !== null ? 'Edit pitcher' : 'Add pitcher'}</strong>
        <div className="row">
          <div className="grow">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pitcher name" />
          </div>
          <div style={{ width: 80 }}>
            <label>#</label>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="7" inputMode="numeric" />
          </div>
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>Throws:</label>
          <button type="button" className={`chip ${throws === 'R' ? 'on' : ''}`} onClick={() => setThrows('R')}>Right</button>
          <button type="button" className={`chip ${throws === 'L' ? 'on' : ''}`} onClick={() => setThrows('L')}>Left</button>
        </div>
        <div>
          <label>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Best pitch, tendencies…" />
        </div>
        <div className="row">
          <button type="submit" className="primary grow">{editingId !== null ? 'Save changes' : 'Add pitcher'}</button>
          {editingId !== null && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>
    </main>
  )
}
