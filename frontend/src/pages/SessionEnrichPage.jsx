import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { enrichArticle } from '../api/ricerche'
import SourceIcon from '../components/SourceIcon'

const FIELD_LABELS = {
  abstract: 'abstract',
  venue: 'venue',
  doi: 'DOI',
  authors: 'autori',
  publication_date: 'data',
}

// Come "Arricchisci tutti" nell'Overview (voce 75), ma limitato agli articoli
// di questa sessione e con scelta esplicita di quali (tutti di default,
// deselezionabili singolarmente) invece di agire sempre sull'intera Ricerca.
// Ultimo passo del percorso guidato forzato: si può tornare indietro a
// Duplicati, ma selezione ed esiti restano quelli di prima (sollevati in
// ResearchLayout come insieme degli esclusi, non stato locale) invece di
// azzerarsi ad ogni rimontaggio.
export default function SessionEnrichPage() {
  const { researchId, sessionArticles, enrichExcluded, setEnrichExcluded, enrichResults, setEnrichResults } =
    useOutletContext()
  const [running, setRunning] = useState(false)

  const selectedIds = sessionArticles.filter((a) => !enrichExcluded.has(a.id)).map((a) => a.id)

  function toggle(id) {
    setEnrichExcluded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setEnrichExcluded((current) =>
      current.size === 0 ? new Set(sessionArticles.map((a) => a.id)) : new Set(),
    )
  }

  async function handleEnrich() {
    setRunning(true)
    for (const id of selectedIds) {
      try {
        const { filled_fields: filledFields } = await enrichArticle(researchId, id)
        setEnrichResults((current) => ({
          ...current,
          [id]: {
            status: 'done',
            message:
              filledFields.length > 0
                ? `+ ${filledFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}`
                : 'Nessun nuovo dato trovato',
          },
        }))
      } catch (err) {
        // Un articolo senza identificativo utile non deve bloccare gli
        // altri selezionati — stessa filosofia resiliente di "Arricchisci
        // tutti": l'errore viene mostrato qui vicino, non propagato.
        setEnrichResults((current) => ({ ...current, [id]: { status: 'error', message: err.message } }))
      }
    }
    setRunning(false)
  }

  const allSelected = sessionArticles.length > 0 && enrichExcluded.size === 0

  return (
    <div className="space-y-6">
      {sessionArticles.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nessun articolo aggiunto in questa sessione:{' '}
          <Link to={`/ricerche/${researchId}/cerca`} className="text-violet-600 hover:underline dark:text-violet-400">
            torna a Cerca
          </Link>{' '}
          per aggiungerne.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleAll}
              disabled={running}
              className="text-sm font-medium text-violet-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-400"
            >
              {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
            <button
              type="button"
              onClick={handleEnrich}
              disabled={running || selectedIds.length === 0}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running
                ? 'Arricchimento…'
                : `Arricchisci ${selectedIds.length} selezionat${selectedIds.length === 1 ? 'o' : 'i'}`}
            </button>
          </div>

          <ul className="space-y-2">
            {sessionArticles.map((article) => {
              const result = enrichResults[article.id]
              return (
                <li
                  key={article.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <input
                    type="checkbox"
                    checked={!enrichExcluded.has(article.id)}
                    onChange={() => toggle(article.id)}
                    disabled={running}
                    className="h-4 w-4 shrink-0 accent-violet-600"
                  />
                  <SourceIcon name={article.source} className="h-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {article.title}
                    </p>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {[article.authors?.join(', '), article.venue].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  {result && (
                    <p
                      className={`shrink-0 max-w-[10rem] truncate text-right text-xs ${
                        result.status === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                      title={result.message}
                    >
                      {result.message}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="flex justify-between border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <Link
          to={`/ricerche/${researchId}/sessione/duplicati`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          ← Indietro
        </Link>
        <Link
          to={`/ricerche/${researchId}/overview`}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Fine — torna alla Ricerca
        </Link>
      </div>
    </div>
  )
}
