import { useState } from 'react'
import { addArticleGroupToRicerca, addArticleToRicerca } from '../api/ricerche'
import { SOURCE_COLORS } from '../constants'
import ArticleDial from './ArticleDial'
import AuthorsYear from './AuthorsYear'
import ExpandedArticleCard from './ExpandedArticleCard'
import { useArticleMorph } from './useArticleMorph'
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
// Senza group_key l'articolo fa gruppo a sé, invece di finire con tutti gli
// altri senza chiave sotto `undefined`.
function groupResults(results) {
  const order = []
  const map = new Map()
  results.forEach((article) => {
    const key = article.group_key ?? article.id
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key).push(article)
  })
  return order.map((key) => ({ key, members: map.get(key) }))
}

// Versioni di un gruppo di duplicati, sotto l'abstract nella card espansa:
// solo informative (fonte, venue/anno, DOI) — si aggiunge il gruppo intero.
function GroupVersions({ members, preferred }) {
  return (
    <div className="mt-5">
      <div className="text-xs font-semibold" style={{ color: '#9CC2FF' }}>
        {members.length} versioni dello stesso articolo
      </div>
      <ul className="mt-2 space-y-2">
        {members.map((m, i) => {
          const colors = SOURCE_COLORS[m.source]
          const year = m.publication_date ? String(m.publication_date).slice(0, 4) : null
          return (
            <li key={m.id ?? i} className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#8B93A5' }}>
              <span className="src-pill" style={{ background: colors?.bg, color: colors?.color, padding: '3px 8px' }}>
                <SourceIcon name={m.source} className="h-3.5" />
              </span>
              <span>{[m.venue, year].filter(Boolean).join(' • ') || '—'}</span>
              {m.id === preferred.id && <span style={{ color: '#D4FF24' }}>preferita</span>}
              {m.doi && (
                <a href={`https://doi.org/${m.doi}`} target="_blank" rel="noreferrer" className="action-link" style={{ color: '#8B93A5' }}>
                  DOI ↗
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function SearchResults({ results, count, loading, error, searched, research, onArticleAdded }) {
  // Stato di aggiunta per gruppo (chiave = group_key): 'idle' | 'adding' | 'added' | 'error'.
  const [addStates, setAddStates] = useState({})
  const [openKey, setOpenKey] = useState(null)
  const morph = useArticleMorph()

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
  const items = groups.map((g, i) => ({
    id: g.key,
    members: g.members,
    article: pickPreferred(g.members),
    caught: addStates[g.key] === 'added',
    num: String(i + 1).padStart(2, '0'),
  }))
  const openItem = items.find((it) => it.id === openKey) ?? null

  // Il pallino aggiunge alla Ricerca: un articolo singolo, o l'intero gruppo
  // di duplicati (ne verrà salvato uno per preferenza — vedi Deduplicazione).
  async function addItem(key) {
    const item = items.find((it) => it.id === key)
    const state = addStates[key]
    if (!research || !item || state === 'adding' || state === 'added') return
    setAddStates((s) => ({ ...s, [key]: 'adding' }))
    try {
      if (item.members.length > 1) await addArticleGroupToRicerca(research.id, item.members)
      else await addArticleToRicerca(research.id, item.article)
      setAddStates((s) => ({ ...s, [key]: 'added' }))
      onArticleAdded?.(item.members)
    } catch {
      setAddStates((s) => ({ ...s, [key]: 'error' }))
    }
  }

  function selectItem(key, rowEl) {
    if (key) morph.open(rowEl, () => setOpenKey(key))
    else morph.close(() => setOpenKey(null))
  }

  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: '#8B93A5' }}>
        {count} risultat{count === 1 ? 'o' : 'i'}
      </p>

      <ArticleDial
        items={items}
        selectedId={openKey}
        onSelect={selectItem}
        // Fuori da una Ricerca specifica non ha senso poter salvare gli articoli: pallino solo indicatore.
        onToggle={research ? addItem : undefined}
        dotLabel="Aggiungi alla ricerca"
        renderItem={(item) => {
          const state = addStates[item.id]
          const colors = SOURCE_COLORS[item.article.source]
          return (
            <>
              <div className="num-badge">{item.num}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  title={item.article.title}
                  style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#F3F4F6' }}
                >
                  {item.article.title}
                </div>
                {state === 'error' || state === 'adding' ? (
                  <div style={{ fontSize: 12, color: state === 'error' ? '#FCA5A5' : '#8B93A5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {state === 'error' ? 'Aggiunta non riuscita — clicca il pallino per riprovare' : 'Aggiunta…'}
                  </div>
                ) : (
                  <AuthorsYear authors={item.article.authors} date={item.article.publication_date} />
                )}
              </div>
              {item.members.length > 1 && (
                <span className="src-pill" style={{ background: 'rgba(43,124,255,.15)', color: '#9CC2FF' }}>
                  ×{item.members.length} fonti
                </span>
              )}
              <span className="src-pill" style={{ background: colors?.bg, color: colors?.color }}>
                {item.article.source}
              </span>
            </>
          )
        }}
      />

      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: '#55606E' }}>
        ↑↓ oppure rotellina/trackpad per scorrere · clicca un articolo per aprirlo
        {research ? ' · il pallino lo aggiunge alla ricerca' : ''}
      </div>

      <ExpandedArticleCard
        article={openItem?.article ?? null}
        onClose={() => selectItem(null)}
        extra={openItem && openItem.members.length > 1 && <GroupVersions members={openItem.members} preferred={openItem.article} />}
      >
        {research && openItem && (
          <button
            type="button"
            onClick={() => addItem(openItem.id)}
            disabled={addStates[openItem.id] === 'adding' || addStates[openItem.id] === 'added'}
            className="ghost-btn"
            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
          >
            {(openItem.members.length > 1 ? GROUP_ADD_LABELS : ADD_LABELS)[addStates[openItem.id] ?? 'idle']}
          </button>
        )}
      </ExpandedArticleCard>
    </div>
  )
}
