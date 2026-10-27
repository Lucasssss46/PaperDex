import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createRicerca, deleteRicerca, listRicerche } from '../api/ricerche'
import { inputClass } from '../components/Field'

function ResearchItem({ research, onDelete }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-violet-200/60 bg-white px-3 py-2 dark:border-violet-500/20 dark:bg-neutral-900">
      <Link to={`/ricerche/${research.id}/overview`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{research.name}</p>
        {research.description && (
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{research.description}</p>
        )}
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(research.id)}
          className="shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Elimina
        </button>
      )}
    </li>
  )
}

function ResearchColumn({ title, items, emptyText, onDelete }) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((research) => (
            <ResearchItem key={research.id} research={research} onDelete={onDelete} />
          ))}
        </ul>
      )}
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

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await listRicerche()
      setMine(data.mine)
      setParticipating(data.participating)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    listRicerche()
      .then((data) => {
        setMine(data.mine)
        setParticipating(data.participating)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
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
      await refresh()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteRicerca(id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Ricerche</h2>

      <form
        onSubmit={handleCreate}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="es. Revisione GNN 2026"
            className={inputClass}
          />
        </label>
        <label className="min-w-[220px] flex-[2]">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Descrizione (opzionale)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="di cosa parla questa ricerca…"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? 'Creazione…' : '+ Nuova ricerca'}
        </button>
      </form>
      {formError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formError}</p>}
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <ResearchColumn
            title="Create da te"
            items={mine}
            emptyText="Non hai ancora creato nessuna ricerca."
            onDelete={handleDelete}
          />
          <ResearchColumn
            title="A cui partecipi"
            items={participating}
            emptyText="Non partecipi ancora a nessuna ricerca."
          />
        </div>
      )}
    </div>
  )
}
