import { useEffect, useState } from 'react'
import { getSourcePriority, setSourcePriority } from '../api/ricerche'
import SourceIcon from './SourceIcon'

// Blocchi trascinabili (drag-and-drop HTML5 nativo, nessuna libreria: solo 5
// elementi da riordinare, non serve altro) per la classifica delle sorgenti
// usata nella scelta automatica di un gruppo di duplicati — priorità
// dall'alto verso il basso. Impostazione della Ricerca, non personale:
// condivisa da tutto il team, come Query salvate/Team.
export default function SourcePriorityEditor({ researchId, isOwner }) {
  const [sources, setSources] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSourcePriority(researchId)
      .then((data) => setSources(data.sources))
      .catch((err) => setError(err.message))
  }, [researchId])

  async function persist(nextSources) {
    setSaving(true)
    setError('')
    try {
      await setSourcePriority(researchId, nextSources)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDrop(targetIndex) {
    if (!isOwner || dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }
    setSources((current) => {
      const next = [...current]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      persist(next)
      return next
    })
    setDragIndex(null)
  }

  if (!sources) {
    return error ? (
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    ) : (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
    )
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Classifica delle sorgenti</h3>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {isOwner
          ? 'Trascina per riordinare: la sorgente più in alto è quella scelta automaticamente aggiungendo un gruppo di duplicati.'
          : 'La sorgente più in alto è quella scelta automaticamente aggiungendo un gruppo di duplicati. Solo il proprietario della Ricerca può modificare l\'ordine.'}
      </p>
      <ol className="mt-3 space-y-2">
        {sources.map((source, index) => (
          <li
            key={source}
            draggable={isOwner}
            onDragStart={() => isOwner && setDragIndex(index)}
            onDragOver={(event) => isOwner && event.preventDefault()}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => setDragIndex(null)}
            className={`flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900 ${
              isOwner ? 'cursor-grab active:cursor-grabbing' : ''
            } ${dragIndex === index ? 'opacity-40' : ''}`}
          >
            {isOwner && (
              <span aria-hidden="true" className="select-none text-neutral-300 dark:text-neutral-600">
                ⠿
              </span>
            )}
            <span className="w-4 text-xs font-semibold text-neutral-400 dark:text-neutral-500">{index + 1}</span>
            <SourceIcon name={source} className="h-4" />
            <span className="text-sm text-neutral-700 dark:text-neutral-200">{source}</span>
          </li>
        ))}
      </ol>
      {saving && <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">Salvataggio…</p>}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
