import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { enrichArticle } from '../api/ricerche'
import DialogLoader from '../components/DialogLoader'
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
    setEnrichExcluded((current) => (current.size === 0 ? new Set(sessionArticles.map((a) => a.id)) : new Set()))
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
            message: filledFields.length > 0 ? `+ ${filledFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}` : 'Nessun nuovo dato trovato',
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
        <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
          Nessun articolo aggiunto in questa sessione:{' '}
          <Link to={`/ricerche/${researchId}/cerca`} className="action-link">
            torna a Cerca
          </Link>{' '}
          per aggiungerne.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={toggleAll} disabled={running} className="action-link disabled:cursor-not-allowed disabled:opacity-60">
              {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
            {/* Credito al tool che fa davvero il lavoro di arricchimento, sotto
                il tasto che lo lancia — discreto, qui è il posto giusto perché è
                la pagina dove l'integrazione è reale e visibile, non un'etichetta
                di navigazione (vedi SessionStepper) che deve restare pulita. */}
            <div className="flex flex-col items-end gap-1.5">
              <button type="button" onClick={handleEnrich} disabled={running || selectedIds.length === 0} className="pill-btn">
                {running ? 'Arricchimento…' : `Arricchisci ${selectedIds.length} selezionat${selectedIds.length === 1 ? 'o' : 'i'}`}
              </button>
              <span className="text-xs" style={{ color: 'var(--color-ink-5)' }}>
                Arricchimento powered by <strong style={{ color: 'var(--color-ink-4)' }}>Zotero</strong>
              </span>
            </div>
          </div>

          {/* Gli esiti arrivano riga per riga qui sotto; intanto il box di dialogo. */}
          {running && <DialogLoader kind="enrich" label="Arricchimento in corso…" />}

          <ul>
            {sessionArticles.map((article) => {
              const result = enrichResults[article.id]
              return (
                <li key={article.id} className="row">
                  <input
                    type="checkbox"
                    checked={!enrichExcluded.has(article.id)}
                    onChange={() => toggle(article.id)}
                    disabled={running}
                    className="h-4 w-4 shrink-0"
                    style={{ accentColor: 'var(--color-blue)' }}
                  />
                  <SourceIcon name={article.source} className="h-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--color-ink-1)' }}>
                      {article.title}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--color-ink-4)' }}>
                      {[article.authors?.join(', '), article.venue].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  {result && (
                    <p
                      className="max-w-[10rem] shrink-0 truncate text-right text-xs"
                      style={{ color: result.status === 'error' ? 'var(--color-err)' : 'var(--color-ok)' }}
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

      <div className="flex justify-between border-t pt-6" style={{ borderColor: 'var(--color-border)' }}>
        <Link to={`/ricerche/${researchId}/sessione/duplicati`} className="ghost-btn" style={{ textDecoration: 'none' }}>
          ← Indietro
        </Link>
        <Link to={`/ricerche/${researchId}/overview`} className="pill-btn" style={{ textDecoration: 'none' }}>
          Fine — torna alla Ricerca
        </Link>
      </div>
    </div>
  )
}
