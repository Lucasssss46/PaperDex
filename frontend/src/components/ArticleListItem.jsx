import { useState } from 'react'
import { enrichArticle } from '../api/ricerche'
import SourceIcon from './SourceIcon'

const FIELD_LABELS = {
  abstract: 'abstract',
  venue: 'venue',
  doi: 'DOI',
  authors: 'autori',
  publication_date: 'data',
}

function EnrichButton({ researchId, article, onEnriched }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [message, setMessage] = useState('')

  async function handleClick() {
    setState('loading')
    setMessage('')
    try {
      const { article: updated, filled_fields: filledFields } = await enrichArticle(researchId, article.id)
      onEnriched?.(article.id, updated)
      setState('done')
      setMessage(
        filledFields.length > 0
          ? `+ ${filledFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}`
          : 'Nessun nuovo dato trovato',
      )
    } catch (err) {
      setState('error')
      setMessage(err.message)
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === 'loading'}
        title="Completa i metadati mancanti (abstract, venue, DOI...) tramite Zotero"
        className="text-xs font-medium text-violet-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-400"
      >
        {state === 'loading' ? 'Arricchimento…' : 'Arricchisci'}
      </button>
      {message && (
        <p
          className={`mt-0.5 max-w-[10rem] truncate text-[11px] ${
            state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
          }`}
          title={message}
        >
          {message}
        </p>
      )}
    </div>
  )
}

export default function ArticleListItem({ article, researchId, onRemove, onEnriched }) {
  const year = article.publication_date ? String(article.publication_date).slice(0, 4) : null

  return (
    <li className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <SourceIcon name={article.source} className="h-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{article.title}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
          {[article.authors?.join(', '), year].filter(Boolean).join(' • ')}
        </p>
      </div>
      {article.doi && (
        <a
          href={`https://doi.org/${article.doi}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          DOI ↗
        </a>
      )}
      {researchId && <EnrichButton researchId={researchId} article={article} onEnriched={onEnriched} />}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(article.id)}
          className="shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Rimuovi
        </button>
      )}
    </li>
  )
}
