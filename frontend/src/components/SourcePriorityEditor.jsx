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
      <p className="text-sm" style={{ color: '#FCA5A5' }}>
        {error}
      </p>
    ) : (
      <p className="text-sm" style={{ color: '#8B93A5' }}>
        Caricamento…
      </p>
    )
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <h3 className="text-sm font-semibold" style={{ color: '#F3F4F6' }}>
        Classifica delle sorgenti
      </h3>
      <p className="mt-1 text-xs" style={{ color: '#8B93A5' }}>
        {isOwner
          ? 'Trascina per riordinare: la sorgente più in alto è quella scelta automaticamente aggiungendo un gruppo di duplicati.'
          : "La sorgente più in alto è quella scelta automaticamente aggiungendo un gruppo di duplicati. Solo il proprietario della Ricerca può modificare l'ordine."}
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
            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isOwner ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ border: '1px solid #1B2130', background: '#0C1119', opacity: dragIndex === index ? 0.4 : 1 }}
          >
            {isOwner && (
              <span aria-hidden="true" className="select-none" style={{ color: '#3A4150' }}>
                ⠿
              </span>
            )}
            <span className="w-4 text-xs font-semibold" style={{ color: '#55606E' }}>
              {index + 1}
            </span>
            <SourceIcon name={source} className="h-4" />
            <span className="text-sm" style={{ color: '#C3C9D4' }}>
              {source}
            </span>
          </li>
        ))}
      </ol>
      {saving && (
        <p className="mt-2 text-xs" style={{ color: '#55606E' }}>
          Salvataggio…
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
    </section>
  )
}
