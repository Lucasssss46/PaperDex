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
      className="rounded-lg p-3"
      style={
        isChosen
          ? { border: '1px solid rgba(212,255,36,.35)', background: 'rgba(212,255,36,.06)' }
          : { border: '1px solid #1B2130', background: '#0C1119' }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SourceIcon name={article.source} className="h-4 shrink-0" />
            <p className="truncate text-sm font-medium" style={{ color: '#F3F4F6' }}>
              {article.title}
            </p>
          </div>
          <p className="mt-1 truncate text-xs" style={{ color: '#8B93A5' }}>
            {[article.authors?.join(', '), article.venue, year].filter(Boolean).join(' • ')}
          </p>
        </div>
        {isChosen ? (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(212,255,36,.12)', color: '#D4FF24' }}>
            Salvato
          </span>
        ) : (
          <button type="button" onClick={onChoose} disabled={busy} className="ghost-btn shrink-0" style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
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
    <section className="card" style={{ padding: 20 }}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-semibold" style={{ color: '#F3F4F6' }}>
          {group.chosen.title}
        </h3>
        {undoStack.length > 0 && (
          <button
            type="button"
            onClick={() => applyChoice(undoStack[undoStack.length - 1], { recordUndo: false })}
            disabled={busy}
            className="action-link shrink-0"
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
      {error && (
        <p className="mt-2 text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
    </section>
  )
}
