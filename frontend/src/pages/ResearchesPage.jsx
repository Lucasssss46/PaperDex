import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createRicerca, deleteRicerca, listRicerche } from '../api/ricerche'
import { inputClass } from '../components/Field'

function ResearchItem({ research, onDelete }) {
  return (
    <li className="row">
      <Link to={`/ricerche/${research.id}/overview`} className="min-w-0 flex-1" style={{ textDecoration: 'none' }}>
        <p className="truncate text-sm font-medium" style={{ color: '#F3F4F6' }}>
          {research.name}
        </p>
        {research.description && (
          <p className="truncate text-xs" style={{ color: '#8B93A5' }}>
            {research.description}
          </p>
        )}
      </Link>
      {onDelete && (
        <button type="button" onClick={() => onDelete(research.id)} className="action-link danger shrink-0">
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
          <p className="py-3 text-sm" style={{ color: '#55606E' }}>
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
  // Il backend gratuito si addormenta: la prima richiesta può durare un minuto.
  const [slow, setSlow] = useState(false)

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
    setSlow(false)
    setLoadFailed(false)
    setError('')
    return fetchRicerche()
  }

  useEffect(() => {
    fetchRicerche()
  }, [])

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(timer)
  }, [loading])

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

  async function handleDelete(id) {
    try {
      await deleteRicerca(id)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h2 className="head text-xl font-semibold" style={{ color: '#F3F4F6' }}>
        Ricerche
      </h2>

      <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-end gap-3 border-b pb-4" style={{ borderColor: '#1B2130' }}>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-sm font-medium" style={{ color: '#C3C9D4' }}>
            Nome
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Revisione GNN 2026" className={inputClass} />
        </label>
        <label className="min-w-[220px] flex-[2]">
          <span className="mb-1 block text-sm font-medium" style={{ color: '#C3C9D4' }}>
            Descrizione (opzionale)
          </span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="di cosa parla questa ricerca…" className={inputClass} />
        </label>
        <button type="submit" disabled={creating} className="pill-btn">
          {creating ? 'Creazione…' : '+ Nuova ricerca'}
        </button>
      </form>
      {formError && (
        <p className="mt-2 text-sm" style={{ color: '#FCA5A5' }}>
          {formError}
        </p>
      )}
      {error && !loadFailed && (
        <p className="mt-4 text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm" style={{ color: '#8B93A5' }}>
          Caricamento…
          {slow && ' Il server si sta avviando: la prima apertura dopo una pausa può richiedere fino a un minuto.'}
        </p>
      ) : loadFailed ? (
        <div className="notice-err mt-6">
          <p>
            Non riesco a caricare le tue Ricerche. Il server potrebbe essere in avvio: riprova tra qualche secondo.
          </p>
          <p className="mt-1 text-xs" style={{ opacity: 0.8 }}>
            Dettaglio: {error}
          </p>
          <button type="button" className="pill-btn mt-3" onClick={load}>
            Riprova
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ResearchColumn title="Create da te" items={mine} emptyText="Non hai ancora creato nessuna ricerca." onDelete={handleDelete} />
          <ResearchColumn title="A cui partecipi" items={participating} emptyText="Non partecipi ancora a nessuna ricerca." muted />
        </div>
      )}
    </div>
  )
}
