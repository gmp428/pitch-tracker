import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, importAll, type BackupFile } from '../db'

export default function Settings() {
  const pitchTypes = useLiveQuery(() => db.pitchTypes.toArray(), [])
  const [newName, setNewName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const addType = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await db.pitchTypes.add({ name, abbr: name.slice(0, 2).toUpperCase() })
    setNewName('')
  }

  const renameType = async (id: number, current: string) => {
    const name = prompt('New name for this pitch type:', current)?.trim()
    if (name) await db.pitchTypes.update(id, { name })
  }

  const removeType = async (id: number) => {
    const used = await db.pitches.filter((p) => p.pitchTypeId === id).count()
    if (used > 0) {
      alert(`This pitch type is used by ${used} logged pitches, so it can’t be deleted.`)
      return
    }
    if (confirm('Delete this pitch type?')) await db.pitchTypes.delete(id)
  }

  const doExport = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pitch-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupFile
      if (!confirm(`Replace ALL current data with the backup from ${new Date(data.exportedAt).toLocaleString()}? This cannot be undone.`)) return
      await importAll(data)
      alert('Backup restored.')
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  if (!pitchTypes) return null

  return (
    <main>
      <h1>Settings</h1>

      <h2>Pitch types</h2>
      <div className="list">
        {pitchTypes.map((t) => (
          <div key={t.id} className="list-item">
            <span className="grow">{t.name}</span>
            <button className="small" onClick={() => renameType(t.id, t.name)}>Rename</button>
            <button className="small danger" onClick={() => removeType(t.id)}>✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={addType} className="row">
        <input
          className="grow"
          placeholder="New pitch type"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="New pitch type"
        />
        <button type="submit" className="primary">Add</button>
      </form>

      <h2>Backup</h2>
      <p className="muted">
        All data lives on this device. Export a backup file every so often (and before switching phones),
        then import it to restore.
      </p>
      <div className="row">
        <button className="primary grow" onClick={doExport}>Export backup</button>
        <button className="grow" onClick={() => fileInput.current?.click()}>Import backup</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
        />
      </div>

      <h2>About</h2>
      <p className="muted">
        Pitch Tracker — log every pitch by type, location, and result to build scouting reports
        on opposing batters and find the right pitch for each matchup.
      </p>
    </main>
  )
}
