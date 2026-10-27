import { useEffect, useRef, useState } from 'react'
import { exportRicercaArticles } from '../api/ricerche'

const FORMATS = [
  { id: 'json', label: 'JSON' },
  { id: 'csv', label: 'CSV' },
  { id: 'bibtex', label: 'BibTeX' },
  { id: 'ris', label: 'RIS' },
]

// Genera il file lato server e lo tiene pronto per il download (un click in
// più, non un download forzato subito): l'utente sceglie il formato dalla
// tendina, il file viene creato, e solo allora compare il link per salvarlo.
// Il link stesso non è gestito qui: `onReady` lo passa al chiamante (vedi
// OverviewPage), che lo mostra su una riga propria sotto l'intera barra
// "Articoli salvati" invece che incollato sotto questo bottone — così la
// sua larghezza (nome file variabile) non ha alcuna colonna da spostare.
export default function ExportMenu({ researchId, onReady }) {
  const [open, setOpen] = useState(false)
  const [generating, setGenerating] = useState(null)
  const [error, setError] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleFormat(formatId) {
    setGenerating(formatId)
    setError('')
    try {
      const { blob, filename } = await exportRicercaArticles(researchId, formatId)
      onReady(URL.createObjectURL(blob), filename)
      setOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        Esporta ▾
      </button>

      {/* Il menu formati resta un overlay fluttuante (dropdown classico, di
          passaggio): non deve spostare il layout della barra sotto di sé. */}
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-36 space-y-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleFormat(f.id)}
              disabled={generating !== null}
              className="block w-full rounded-lg px-3 py-1.5 text-right text-sm text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {generating === f.id ? 'Generazione…' : f.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-red-50 px-2 py-1 text-right text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
