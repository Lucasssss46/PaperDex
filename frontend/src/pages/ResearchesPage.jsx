import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createRicerca, deleteRicerca, listRicerche } from '../api/ricerche'
import { useConfirm } from '../components/useConfirm'
import { LoadError, LoadingNote } from '../components/LoadState'
import { inputClass } from '../components/Field'
import FormError from '../components/FormError'

function ResearchItem({ research, onDelete }) {
  return (
    <li className="row">
      <Link to={`/ricerche/${research.id}/overview`} className="min-w-0 flex-1" style={{ textDecoration: 'none' }}>
        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-ink-1)' }}>
          {research.name}
        </p>
        {research.description && (
          <p className="truncate text-xs" style={{ color: 'var(--color-ink-4)' }}>
            {research.description}
          </p>
        )}
      </Link>
      {onDelete && (
        <button type="button" onClick={() => onDelete(research)} className="action-link danger shrink-0">
          Elimina
        </button>
      )}
    </li>
  )
}

function ResearchColumn({ title, items, emptyText, onDelete, muted }) {
  return (
    <section className="card" style={{ padding: 0 }}>
      <div className={`ribbon-flat ${muted ? 'muted' : ''}`}>{title}</div>
      <div style={{ padding: '4px 16px 10px' }}>
        {items.length === 0 ? (
          <p className="py-3 text-sm" style={{ color: 'var(--color-ink-5)' }}>
            {emptyText}
          </p>
        ) : (
          <ul>
            {items.map((research) => (
              <ResearchItem key={research.id} research={research} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function ResearchesPage() {
  const [confirm, confirmDialog] = useConfirm()
  const [mine, setMine] = useState([])
  const [participating, setParticipating] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  // Un errore di caricamento non deve sembrare "nessuna Ricerca": senza dati
  // validi si mostra l'errore con "Riprova", mai le colonne vuote.
  const [loadFailed, setLoadFailed] = useState(false)

  function fetchRicerche() {
    return listRicerche()
      .then((data) => {
        setMine(data.mine)
        setParticipating(data.participating)
      })
      .catch((err) => {
        setLoadFailed(true)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }

  // Ricaricamento (Riprova, dopo creazione o cancellazione).
  function load() {
    setLoading(true)
    setLoadFailed(false)
    setError('')
    return fetchRicerche()
  }

  useEffect(() => {
    fetchRicerche()
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    if (!name.trim()) {
      setFormError('Il nome è obbligatorio.')
      return
    }

    setFormError('')
    setCreating(true)
    try {
      await createRicerca(name.trim(), description.trim())
      setName('')
      setDescription('')
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(research) {
    // Irreversibile: cancella anche articoli, query, team, inviti e duplicati (voce 126).
    const ok = await confirm({
      title: `Eliminare la Ricerca "${research.name}"?`,
      message:
        'Verranno cancellati, per tutto il team, gli articoli salvati, le query, la cronologia, gli inviti e i gruppi di duplicati.\n\nNon si può annullare.',
      confirmLabel: 'Elimina definitivamente',
      requireText: research.name,
    })
    if (!ok) return
    try {
      await deleteRicerca(research.id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {confirmDialog}
      <h2 className="head text-xl font-semibold" style={{ color: 'var(--color-ink-1)' }}>
        Ricerche
      </h2>

      <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3 border-b pb-4" style={{ borderColor: 'var(--color-border)' }}>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-ink-2)' }}>
            Nome
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Revisione GNN 2026" className={inputClass} />
        </label>
        <label className="min-w-[220px] flex-[2]">
          <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-ink-2)' }}>
            Descrizione (opzionale)
          </span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="di cosa parla questa ricerca…" className={inputClass} />
        </label>
        <button type="submit" disabled={creating} className="pill-btn">
          {creating ? 'Creazione…' : '+ Nuova ricerca'}
        </button>
      </form>
      <FormError message={formError} className="mt-2 text-sm" style={{ color: 'var(--color-err)' }} />
      {error && !loadFailed && (
        <p role="alert" className="mt-4 text-sm" style={{ color: 'var(--color-err)' }}>
          {error}
        </p>
      )}

      {loading ? (
        <LoadingNote className="mt-6 text-sm" />
      ) : loadFailed ? (
        <LoadError what="le tue Ricerche" message={error} onRetry={load} className="mt-6" />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ResearchColumn title="Create da te" items={mine} emptyText="Non hai ancora creato nessuna ricerca." onDelete={handleDelete} />
          <ResearchColumn title="A cui partecipi" items={participating} emptyText="Non partecipi ancora a nessuna ricerca." muted />
        </div>
      )}
    </div>
  )
}
