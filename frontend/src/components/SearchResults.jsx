import { useState } from 'react'
import { addArticleGroupToRicerca, addArticleToRicerca } from '../api/ricerche'
import { SOURCE_COLORS } from '../constants'
import Spinner from './Spinner'
import SourceIcon from './SourceIcon'

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
  const srcColors = SOURCE_COLORS[article.source]

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
    <li className="card" style={{ padding: 20 }}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold" style={{ color: '#F3F4F6' }}>
          {article.title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {preferred && (
            <span className="rounded-full px-2 py-1 text-xs font-medium" style={{ background: 'rgba(212,255,36,.12)', color: '#D4FF24' }}>
              Preferito per il gruppo
            </span>
          )}
          <span className="src-pill" style={{ background: srcColors?.bg, color: srcColors?.color, padding: '4px 10px' }}>
            <SourceIcon name={article.source} className="h-4" />
          </span>
        </div>
      </div>

      <p className="mt-1 text-sm" style={{ color: '#8B93A5' }}>
        {[article.authors?.join(', '), article.venue, year].filter(Boolean).join(' • ')}
      </p>

      {article.abstract && (
        <p className={`mt-3 text-sm ${expanded ? '' : 'line-clamp-3'}`} style={{ color: '#C3C9D4' }}>
          {article.abstract}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          {article.abstract && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="action-link">
              {expanded ? 'Mostra meno' : 'Mostra tutto'}
            </button>
          )}
          {article.doi && (
            <a href={`https://doi.org/${article.doi}`} target="_blank" rel="noreferrer" className="action-link" style={{ color: '#8B93A5' }}>
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
            className="ghost-btn"
            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
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
    <li className="card" style={{ padding: 16, borderColor: 'rgba(43,124,255,.4)', borderWidth: 2 }}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <span className="text-xs font-semibold" style={{ color: '#9CC2FF' }}>
          {articles.length} versioni dello stesso articolo trovate
        </span>
        {research && (
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={addState === 'adding' || addState === 'added'}
            className="ghost-btn"
            style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600 }}
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
      <div className="flex flex-col items-center gap-3 py-16" style={{ color: '#8B93A5' }}>
        <Spinner className="h-8 w-8" />
        <p className="text-sm">Ricerca in corso… con profondità alta può richiedere fino a un minuto.</p>
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#FCA5A5' }}>
        {error}
      </p>
    )
  }

  if (!searched) return null

  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: '#8B93A5' }}>
        Nessun risultato trovato. Prova ad allargare i criteri di ricerca.
      </p>
    )
  }

  const groups = groupResults(results)

  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: '#8B93A5' }}>
        {count} risultat{count === 1 ? 'o' : 'i'}
      </p>
      <ul className="space-y-4">
        {groups.map((group) =>
          group.length > 1 ? (
            <DuplicateGroupCard key={group[0].group_key} articles={group} research={research} onAdded={onArticleAdded} />
          ) : (
            <ArticleCard key={group[0].id} article={group[0]} research={research} onAdded={onArticleAdded} />
          ),
        )}
      </ul>
    </div>
  )
}
