import { useEffect, useImperativeHandle, useState } from 'react'
import { addArticleGroupToRicerca, addArticleToRicerca } from '../api/ricerche'
import { SOURCE_COLORS } from '../constants'
import ArticleDial from './ArticleDial'
import DialogLoader from './DialogLoader'
import AuthorsYear from './AuthorsYear'
import ExpandedArticleCard from './ExpandedArticleCard'
import { useArticleMorph } from './useArticleMorph'
import SourceIcon from './SourceIcon'

// Larghezze (%) variate dei titoli finti, così lo scheletro non sembra una griglia.
const SKELETON_ITEMS = [78, 62, 85, 55, 72, 66].map((w, i) => ({ id: i, w, caught: false }))

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
      <div className="text-xs font-semibold" style={{ color: 'var(--color-ink-3)' }}>
        {members.length} versioni dello stesso articolo
      </div>
      <ul className="mt-2 space-y-2">
        {members.map((m, i) => {
          const colors = SOURCE_COLORS[m.source]
          const year = m.publication_date ? String(m.publication_date).slice(0, 4) : null
          return (
            <li key={m.id ?? i} className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-ink-4)' }}>
              <span className="src-pill" style={{ background: colors?.bg, color: colors?.color, padding: '3px 8px' }}>
                <SourceIcon name={m.source} className="h-3.5" />
              </span>
              <span>{[m.venue, year].filter(Boolean).join(' • ') || '—'}</span>
              {m.id === preferred.id && <span style={{ color: 'var(--color-lime)' }}>preferita</span>}
              {m.doi && (
                <a href={`https://doi.org/${m.doi}`} target="_blank" rel="noreferrer" className="action-link" style={{ color: 'var(--color-ink-4)' }}>
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

// `ref` espone addSelected(): la pagina lo chiama quando si passa alla
// deduplicazione, che è il momento in cui la selezione viene salvata.
// `onSelectionChange(n)` comunica quanti articoli sono selezionati.
export default function SearchResults({ results, count, loading, error, searched, research, onArticleAdded, onSelectionChange, ref }) {
  // Stato di aggiunta per gruppo (chiave = group_key): 'idle' | 'adding' | 'added' | 'error'.
  const [addStates, setAddStates] = useState({})
  // Selezione temporanea (pallino): non salva nulla e si toglie con lo stesso
  // clic. Gli articoli selezionati si salvano nella Ricerca passando alla
  // deduplicazione (barra di sessione in SearchArticlesPage).
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [openKey, setOpenKey] = useState(null)
  const morph = useArticleMorph()

  const isLocked = (key) => ['adding', 'added', 'present'].includes(addStates[key])
  const groups = groupResults(results)
  const items = groups.map((g, i) => ({
    id: g.key,
    members: g.members,
    article: pickPreferred(g.members),
    caught: addStates[g.key] === 'added' || addStates[g.key] === 'present' || selectedKeys.has(g.key),
    num: String(i + 1).padStart(2, '0'),
    label: pickPreferred(g.members).title,
    locked: isLocked(g.key),
  }))
  // Solo le chiavi dei risultati attuali: la selezione di una ricerca precedente non conta.
  const selectable = items.filter((it) => !isLocked(it.id))
  const selectedItems = selectable.filter((it) => selectedKeys.has(it.id))
  const allSelected = selectable.length > 0 && selectedItems.length === selectable.length

  // Salva nella Ricerca un articolo singolo, o l'intero gruppo di duplicati
  // (ne verrà salvato uno per preferenza — vedi Deduplicazione).
  async function addItem(item) {
    setAddStates((s) => ({ ...s, [item.id]: 'adding' }))
    try {
      const data =
        item.members.length > 1
          ? await addArticleGroupToRicerca(research.id, item.members)
          : await addArticleToRicerca(research.id, item.article)
      // Già salvato nella Ricerca (da chiunque): non è un errore, ma non conta come nuovo.
      const outcome = data?.already_present ? 'present' : 'added'
      setAddStates((s) => ({ ...s, [item.id]: outcome }))
      setSelectedKeys((current) => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      if (outcome === 'added') onArticleAdded?.(item.members)
      return outcome
    } catch {
      // Resta selezionato: ripassando alla deduplicazione si riprova.
      setAddStates((s) => ({ ...s, [item.id]: 'error' }))
      return 'error'
    }
  }

  // Uno alla volta: ogni aggiunta confronta l'articolo con quelli già salvati
  // (deduplicazione tra sessioni), quindi l'ordine conta. Restituisce quanti
  // articoli sono stati salvati, quanti erano già presenti e quanti sono falliti.
  async function addSelected() {
    const counts = { added: 0, present: 0, failed: 0 }
    if (research) {
      for (const item of selectedItems) {
        const outcome = await addItem(item)
        counts[outcome === 'error' ? 'failed' : outcome] += 1
      }
    }
    return counts
  }

  useImperativeHandle(ref, () => ({ addSelected }))

  const selectedCount = selectedItems.length
  useEffect(() => {
    onSelectionChange?.(selectedCount)
  }, [selectedCount, onSelectionChange])

  if (loading) {
    // Stessa ruota e stesse righe dei risultati veri, con barre al posto del testo.
    return (
      <div aria-busy="true" aria-label="Ricerca in corso">
        <div className="mb-4">
          <DialogLoader kind={research ? 'search' : 'search-quick'} label="Ricerca in corso…" />
        </div>
        <ArticleDial
          items={SKELETON_ITEMS}
          dotLabel=""
          renderItem={(item) => (
            <>
              <div className="num-badge skeleton" style={{ borderRadius: 999 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="skeleton" style={{ height: 12, width: `${item.w}%`, marginBottom: 7 }} />
                <div className="skeleton" style={{ height: 9, width: '35%' }} />
              </div>
              <span className="skeleton" style={{ width: 64, height: 18, borderRadius: 999, flex: '0 0 auto' }} />
            </>
          )}
        />
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg px-4 py-3 text-sm" style={{ background: 'color-mix(in srgb, var(--color-err-base) 10%, transparent)', color: 'var(--color-err)' }}>
        {error}
      </p>
    )
  }

  if (!searched) return null

  if (results.length === 0) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-ink-4)' }}>
        Nessun risultato trovato. Prova ad allargare i criteri di ricerca.
      </p>
    )
  }

  const openItem = items.find((it) => it.id === openKey) ?? null

  function toggleSelected(key) {
    if (isLocked(key)) return
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectItem(key, rowEl) {
    if (key) morph.open(rowEl, () => setOpenKey(key))
    else morph.close(() => setOpenKey(null))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
          {count} risultat{count === 1 ? 'o' : 'i'}
        </p>
        {research && (
          <button
            type="button"
            className="action-link ml-auto"
            disabled={selectable.length === 0}
            onClick={() => setSelectedKeys(allSelected ? new Set() : new Set(selectable.map((it) => it.id)))}
          >
            {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
          </button>
        )}
      </div>
      {research && (
        <p className="mb-4 text-xs" style={{ color: 'var(--color-ink-4)' }}>
          Clicca il pallino o il numero per selezionare o deselezionare un articolo. I selezionati vengono aggiunti alla Ricerca
          quando passi alla deduplicazione.
        </p>
      )}

      <ArticleDial
        items={items}
        selectedId={openKey}
        onSelect={selectItem}
        // Fuori da una Ricerca specifica non ha senso poter salvare gli articoli: pallino solo indicatore.
        onToggle={research ? toggleSelected : undefined}
        dotLabel="Seleziona"
        renderItem={(item) => {
          const state = addStates[item.id]
          const colors = SOURCE_COLORS[item.article.source]
          return (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  title={item.article.title}
                  style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-ink-1)' }}
                >
                  {item.article.title}
                </div>
                {state === 'error' || state === 'adding' || state === 'added' || state === 'present' ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: state === 'error' ? 'var(--color-err)' : state === 'adding' ? 'var(--color-ink-4)' : 'var(--color-lime)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {state === 'error'
                      ? 'Aggiunta non riuscita: resta selezionato, verrà ritentata'
                      : state === 'added'
                        ? 'Aggiunto alla Ricerca ✓'
                        : state === 'present'
                          ? 'Già nella Ricerca ✓'
                          : 'Aggiunta…'}
                  </div>
                ) : (
                  <AuthorsYear authors={item.article.authors} date={item.article.publication_date} />
                )}
              </div>
              {item.members.length > 1 && (
                <span className="src-pill" style={{ background: 'color-mix(in srgb, var(--color-blue) 15%, transparent)', color: 'var(--color-ink-3)' }}>
                  ×{item.members.length} sorgenti
                </span>
              )}
              <span className="src-pill" style={{ background: colors?.bg, color: colors?.color }}>
                {item.article.source}
              </span>
            </>
          )
        }}
      />

      <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--color-ink-5)' }}>
        ↑↓ oppure rotellina/trackpad per scorrere · clicca un articolo per aprirlo
        {research ? ' · il pallino o il numero lo seleziona o lo deseleziona' : ''}
      </div>

      <ExpandedArticleCard
        article={openItem?.article ?? null}
        onClose={() => selectItem(null)}
        extra={openItem && openItem.members.length > 1 && <GroupVersions members={openItem.members} preferred={openItem.article} />}
      >
        {research && openItem && (
          <button
            type="button"
            onClick={() => toggleSelected(openItem.id)}
            disabled={isLocked(openItem.id)}
            className="ghost-btn"
            style={{ fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
          >
            {addStates[openItem.id] === 'added'
              ? 'Aggiunto alla Ricerca ✓'
              : addStates[openItem.id] === 'present'
              ? 'Già nella Ricerca ✓'
              : selectedKeys.has(openItem.id)
                ? 'Deseleziona'
                : openItem.members.length > 1
                  ? 'Seleziona il gruppo'
                  : 'Seleziona'}
          </button>
        )}
      </ExpandedArticleCard>
    </div>
  )
}
