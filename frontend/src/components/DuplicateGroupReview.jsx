import { useState } from 'react'
import { chooseDuplicate } from '../api/ricerche'
import SourceIcon from './SourceIcon'

// Card di revisione di un singolo gruppo di duplicati: quale versione è
// quella salvata ("scelta") e le alternative scartate, con la possibilità di
// scambiarle. Estratto da DeduplicationPage (tab "Deduplicazione", tutti i
// gruppi della Ricerca) perché la stessa interfaccia serve anche alla
// revisione limitata ai soli duplicati della sessione corrente.
function GroupMember({ article, isChosen, onChoose, busy }) {
  const year = article.publication_date ? String(article.publication_date).slice(0, 4) : null

  return (
    <li
      className={`rounded-lg border p-3 ${
        isChosen
          ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/10'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SourceIcon name={article.source} className="h-4 shrink-0" />
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{article.title}</p>
          </div>
          <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
            {[article.authors?.join(', '), article.venue, year].filter(Boolean).join(' • ')}
          </p>
        </div>
        {isChosen ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            Salvato
          </span>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            disabled={busy}
            className="shrink-0 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            Scegli questo
          </button>
        )}
      </div>
    </li>
  )
}

export default function DuplicateGroupReview({ researchId, group, onUpdated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Cronologia delle scelte precedenti in questa visita: "Annulla" ripristina
  // l'ultima, ma solo finché non si lascia la pagina (si perde al reload).
  const [undoStack, setUndoStack] = useState([])

  async function applyChoice(articleId, { recordUndo }) {
    setBusy(true)
    setError('')
    try {
      await chooseDuplicate(researchId, group.id, articleId)
      if (recordUndo) {
        setUndoStack((stack) => [...stack, group.chosen.id])
      } else {
        setUndoStack((stack) => stack.slice(0, -1))
      }
      onUpdated(group.id, articleId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const members = [group.chosen, ...group.alternatives]

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
          {group.chosen.title}
        </h3>
        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={() => applyChoice(undoStack[undoStack.length - 1], { recordUndo: false })}
            disabled={busy}
            className="shrink-0 text-xs font-medium text-violet-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-400"
          >
            Annulla ultima scelta
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {members.map((article) => (
          <GroupMember
            key={article.id}
            article={article}
            isChosen={article.id === group.chosen.id}
            onChoose={() => applyChoice(article.id, { recordUndo: true })}
            busy={busy}
          />
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
