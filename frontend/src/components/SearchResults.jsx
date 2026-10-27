import { useState } from 'react'
import { addArticleGroupToRicerca, addArticleToRicerca } from '../api/ricerche'
import Spinner from './Spinner'
import SourceIcon from './SourceIcon'

const SOURCE_COLORS = {
  ArXiv: 'bg-red-100 dark:bg-red-500/20',
  Crossref: 'bg-blue-100 dark:bg-blue-500/20',
  DBLP: 'bg-amber-100 dark:bg-amber-500/20',
  OpenAlex: 'bg-emerald-100 dark:bg-emerald-500/20',
  'Semantic Scholar': 'bg-cyan-100 dark:bg-cyan-500/20',
}

const ADD_LABELS = {
  idle: '+ Aggiungi alla ricerca',
  adding: 'Aggiunta…',
  added: 'Aggiunto ✓',
  error: 'Riprova',
}

const GROUP_ADD_LABELS = {
  idle: '+ Aggiungi tutto il gruppo',
  adding: 'Aggiunta…',
  added: 'Aggiunto ✓',
  error: 'Riprova',
}

// Placeholder: stesso ordine (arbitrario) usato lato server per scegliere
// automaticamente un articolo da un gruppo — vedi services/utils/dedup.py.
// Qui serve solo per mostrare in anteprima quale verrebbe scelto, la scelta
// vera resta autoritativa sul backend.
const SOURCE_PRIORITY = ['ArXiv', 'Crossref', 'DBLP', 'OpenAlex', 'Semantic Scholar']

function pickPreferred(articles) {
  return [...articles].sort((a, b) => SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source))[0]
}

// Un gruppo per ogni group_key distinto, nell'ordine di prima comparsa —
// gruppi da un solo articolo restano tali (si raggruppano solo i duplicati).
function groupResults(results) {
  const order = []
  const map = new Map()
  results.forEach((article) => {
    const key = article.group_key
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key).push(article)
  })
  return order.map((key) => map.get(key))
}

function ArticleCard({ article, research, onAdded, preferred }) {
  const [expanded, setExpanded] = useState(false)
  const [addState, setAddState] = useState('idle')
  const year = article.publication_date ? String(article.publication_date).slice(0, 4) : null
  const badgeClass = SOURCE_COLORS[article.source] ?? 'bg-neutral-100 dark:bg-neutral-800'

  async function handleAdd() {
    setAddState('adding')
    try {
      await addArticleToRicerca(research.id, article)
      setAddState('added')
      onAdded?.([article])
    } catch {
      setAddState('error')
    }
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{article.title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {preferred && (
            <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              Preferito per il gruppo
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${badgeClass}`}>
            <SourceIcon name={article.source} className="h-4" />
          </span>
        </div>
      </div>

      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        {[article.authors?.join(', '), article.venue, year].filter(Boolean).join(' • ')}
      </p>

      {article.abstract && (
        <p
          className={`mt-3 text-sm text-neutral-600 dark:text-neutral-300 ${expanded ? '' : 'line-clamp-3'}`}
        >
          {article.abstract}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          {article.abstract && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="font-medium text-violet-600 hover:underline dark:text-violet-400"
            >
              {expanded ? 'Mostra meno' : 'Mostra tutto'}
            </button>
          )}
          {article.doi && (
            <a
              href={`https://doi.org/${article.doi}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-violet-600 hover:underline dark:text-violet-400"
            >
              DOI ↗
            </a>
          )}
        </div>

        {/* Fuori da una Ricerca specifica non ha senso poter salvare gli articoli. */}
        {research && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={addState === 'adding' || addState === 'added'}
            className="rounded-lg border border-violet-300 px-3 py-1.5 font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            {ADD_LABELS[addState]}
          </button>
        )}
      </div>
    </li>
  )
}

// Un gruppo di articoli considerati duplicati tra loro (stesso group_key):
// evidenziato graficamente, con un'azione in più per aggiungerli tutti in
// blocco (ne verrà comunque salvato solo uno, per preferenza — vedi
// Deduplicazione) oltre alla possibilità di aggiungerli singolarmente.
function DuplicateGroupCard({ articles, research, onAdded }) {
  const [addState, setAddState] = useState('idle')
  const preferred = pickPreferred(articles)

  async function handleAddGroup() {
    setAddState('adding')
    try {
      await addArticleGroupToRicerca(research.id, articles)
      setAddState('added')
      onAdded?.(articles)
    } catch {
      setAddState('error')
    }
  }

  return (
    <li className="rounded-xl border-2 border-violet-300 bg-violet-50/50 p-4 dark:border-violet-500/40 dark:bg-violet-500/5">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="text-xs font-semibold text-violet-800 dark:text-violet-300">
          {articles.length} versioni dello stesso articolo trovate
        </span>
        {research && (
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={addState === 'adding' || addState === 'added'}
            className="rounded-lg border border-violet-400 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-violet-500/50 dark:bg-neutral-900 dark:text-violet-300 dark:hover:bg-violet-500/10"
          >
            {GROUP_ADD_LABELS[addState]}
          </button>
        )}
      </div>
      <ul className="space-y-3">
        {articles.map((article, index) => (
          <ArticleCard
            key={article.id ?? index}
            article={article}
            research={research}
            onAdded={onAdded}
            preferred={article.id === preferred.id}
          />
        ))}
      </ul>
    </li>
  )
}

export default function SearchResults({ results, count, loading, error, searched, research, onArticleAdded }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-neutral-500 dark:text-neutral-400">
        <Spinner className="h-8 w-8" />
        <p className="text-sm">Ricerca in corso… con profondità alta può richiedere fino a un minuto.</p>
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {error}
      </p>
    )
  }

  if (!searched) return null

  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Nessun risultato trovato. Prova ad allargare i criteri di ricerca.
      </p>
    )
  }

  const groups = groupResults(results)

  return (
    <div>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        {count} risultat{count === 1 ? 'o' : 'i'}
      </p>
      <ul className="space-y-4">
        {groups.map((group) =>
          group.length > 1 ? (
            <DuplicateGroupCard
              key={group[0].group_key}
              articles={group}
              research={research}
              onAdded={onArticleAdded}
            />
          ) : (
            <ArticleCard key={group[0].id} article={group[0]} research={research} onAdded={onArticleAdded} />
          ),
        )}
      </ul>
    </div>
  )
}
