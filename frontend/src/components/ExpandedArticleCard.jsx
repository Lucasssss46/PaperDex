import { useLayoutEffect, useRef } from 'react'
import { SOURCE_COLORS } from '../constants'
import SourceIcon from './SourceIcon'
import { ARTICLE_VT_NAME } from './useArticleMorph'

// Card espansa di un articolo, in un <dialog> modale nativo (focus, Esc e
// scroll della pagina bloccato gestiti dal browser). `children` = azioni
// specifiche del contesto (Aggiungi, Arricchisci, Rimuovi...), in alto a
// destra; `extra` = contenuto aggiuntivo sotto l'abstract (es. le versioni
// di un gruppo di duplicati).
export default function ExpandedArticleCard({ article, onClose, children, extra }) {
  const dialogRef = useRef(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (article && dialog && !dialog.open) dialog.showModal()
  }, [article])

  if (!article) return null

  const year = article.publication_date ? String(article.publication_date).slice(0, 4) : null
  const srcColors = SOURCE_COLORS[article.source]

  return (
    <dialog
      ref={dialogRef}
      className="article-dialog"
      aria-label={article.title}
      onCancel={(e) => {
        // Esc: chiusura animata come il click fuori, non quella istantanea del browser.
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="card article-dialog-card" style={{ viewTransitionName: ARTICLE_VT_NAME }}>
        <div className="flex items-start justify-end gap-4 text-xs">
          {children}
          <button type="button" className="action-link" aria-label="Chiudi" onClick={onClose} style={{ color: '#8B93A5', fontSize: 16, lineHeight: 1 }}>
            ✕
          </button>
        </div>

        <h2 className="head mt-3 text-lg font-semibold" style={{ color: '#F3F4F6' }}>
          {article.title}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: '#8B93A5' }}>
          <span className="src-pill" style={{ background: srcColors?.bg, color: srcColors?.color, padding: '4px 10px' }}>
            <SourceIcon name={article.source} className="h-4" />
          </span>
          <span>{[article.authors?.join(', '), article.venue, year].filter(Boolean).join(' • ')}</span>
        </div>

        <p className="mt-6 text-sm leading-relaxed" style={{ color: article.abstract ? '#C3C9D4' : '#55606E' }}>
          {article.abstract || 'Abstract non disponibile.'}
        </p>

        {extra}

        {article.doi && (
          <div className="mt-5 text-xs">
            <a href={`https://doi.org/${article.doi}`} target="_blank" rel="noreferrer" className="action-link" style={{ color: '#8B93A5' }}>
              DOI ↗
            </a>
          </div>
        )}
      </div>
    </dialog>
  )
}
