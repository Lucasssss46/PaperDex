import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  checkAllArticlesVersion,
  checkArticleVersion,
  enrichAllArticles,
  enrichArticle,
  listDuplicateGroups,
  listRicercaArticles,
  listRicercaCronologia,
  listRicercaQueries,
  removeRicercaArticle,
} from '../api/ricerche'
import ArticleDial from '../components/ArticleDial'
import ExportMenu from '../components/ExportMenu'
import HistoryEntryItem from '../components/HistoryEntryItem'
import Logo from '../components/Logo'
import QueryListItem from '../components/QueryListItem'
import { SOURCE_COLORS } from '../constants'

const FETCH_PAGE_SIZE = 50
// Anteprime della card "Attività": al massimo questi pochi elementi, non
// l'intera lista — altrimenti la card crescerebbe senza limite con una
// Ricerca attiva da tempo. "Vedi tutti" (le freccine) porta al resto.
const HISTORY_PREVIEW_COUNT = 4
const QUERIES_PREVIEW_COUNT = 4

// Freccia corta e "cicciotta" (tratto breve, spessore alto) per "vai alla
// pagina completa" — un carattere Unicode ("↗") non è controllabile a
// sufficienza nello spessore/proporzioni, da qui un'icona propria.
function ArrowUpRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 15 15 9" />
      <path d="M10 9h5v5" />
    </svg>
  )
}

// Unico contenuto che l'intera Ricerca può avere in quantità realistica
// (decine/qualche centinaio, non migliaia — stessa assunzione già fatta
// lato backend): la ruota vuole l'intera collezione per poterci scorrere
// in continuo, non una pagina alla volta, quindi le carica tutte qui
// invece di esporre Precedente/Successiva come prima.
async function fetchAllArticles(researchId) {
  let page = 1
  let all = []
  for (;;) {
    const result = await listRicercaArticles(researchId, { page, pageSize: FETCH_PAGE_SIZE })
    all = all.concat(result.articles)
    if (page >= result.total_pages) break
    page += 1
  }
  return all
}

export default function OverviewPage() {
  const { researchId, startNewSession, isOwner } = useOutletContext()
  const navigate = useNavigate()

  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const [queries, setQueries] = useState([])
  const [queriesLoading, setQueriesLoading] = useState(true)
  const [queriesError, setQueriesError] = useState('')

  const [duplicateGroups, setDuplicateGroups] = useState([])
  const [dedupLoading, setDedupLoading] = useState(true)
  const [dedupError, setDedupError] = useState('')

  // Selezione nella ruota + stato dell'azione sull'articolo selezionato.
  const [selectedId, setSelectedId] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [actionColor, setActionColor] = useState('')

  // "Manutenzione": chiuso di default (le due azioni bulk sono lente e
  // non necessarie ad ogni visita — stavano dietro un tasto apposta per
  // non sommergere l'utente appena entra in Overview).
  const [menuOpen, setMenuOpen] = useState(false)
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)
  const [toast, setToast] = useState(null) // { kind: 'enrich'|'update', parts: [{text,color}], detailRows: [{title,msg,color}] }

  const [exportReady, setExportReady] = useState(null)

  useEffect(() => {
    return () => {
      if (exportReady) URL.revokeObjectURL(exportReady.url)
    }
  }, [exportReady])

  function handleExportReady(url, filename) {
    setExportReady((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { url, filename }
    })
  }

  useEffect(() => {
    fetchAllArticles(researchId)
      .then((all) => {
        setArticles(all)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId])

  useEffect(() => {
    listRicercaCronologia(researchId, { page: 1, pageSize: HISTORY_PREVIEW_COUNT })
      .then((result) => setHistory(result.entries))
      .catch((err) => setHistoryError(err.message))
      .finally(() => setHistoryLoading(false))
  }, [researchId])

  useEffect(() => {
    listRicercaQueries(researchId)
      .then((result) => setQueries(result.queries))
      .catch((err) => setQueriesError(err.message))
      .finally(() => setQueriesLoading(false))
  }, [researchId])

  useEffect(() => {
    listDuplicateGroups(researchId)
      .then((result) => setDuplicateGroups(result.groups))
      .catch((err) => setDedupError(err.message))
      .finally(() => setDedupLoading(false))
  }, [researchId])

  function selectRow(id) {
    setSelectedId(id)
    setActionMsg('')
    setActionColor('')
  }

  const selectedArticle = articles.find((a) => a.id === selectedId) ?? null

  async function handleEnrichSelected() {
    if (!selectedArticle) return
    setActionBusy(true)
    setActionMsg('')
    try {
      const { article: updated, filled_fields } = await enrichArticle(researchId, selectedArticle.id)
      setArticles((current) => current.map((a) => (a.id === updated.id ? updated : a)))
      setActionMsg(filled_fields.length > 0 ? `+ ${filled_fields.join(', ')}` : 'Nessun nuovo dato trovato')
      setActionColor(filled_fields.length > 0 ? '#6EE7B7' : '#55606E')
    } catch (err) {
      setActionMsg(err.message)
      setActionColor('#FCA5A5')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleCheckVersionSelected() {
    if (!selectedArticle) return
    setActionBusy(true)
    setActionMsg('')
    try {
      const result = await checkArticleVersion(researchId, selectedArticle.id)
      if (!result.found) {
        setActionMsg('Nessuna novità')
        setActionColor('#55606E')
      } else if (result.kind === 'revision') {
        setActionMsg(result.message)
        setActionColor('#D4FF24')
      } else {
        setActionMsg(`${result.message} — in Deduplicazione`)
        setActionColor('#FCD34D')
        listDuplicateGroups(researchId)
          .then((r) => setDuplicateGroups(r.groups))
          .catch(() => {})
      }
    } catch (err) {
      setActionMsg(err.message)
      setActionColor('#FCA5A5')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRemoveSelected() {
    if (!selectedArticle || !isOwner) return
    try {
      await removeRicercaArticle(researchId, selectedArticle.id)
      setArticles((current) => current.filter((a) => a.id !== selectedArticle.id))
      setSelectedId(null)
    } catch (err) {
      setActionMsg(err.message)
      setActionColor('#FCA5A5')
    }
  }

  async function handleEnrichAll() {
    setMenuOpen(false)
    setEnrichingAll(true)
    try {
      const result = await enrichAllArticles(researchId)
      const updatedById = new Map(result.enriched.map((e) => [e.article.id, e.article]))
      setArticles((current) => current.map((a) => updatedById.get(a.id) ?? a))
      const parts = [{ text: `${result.enriched.length} di ${result.total} completati`, color: '#6EE7B7' }]
      if (result.errors.length > 0) parts.push({ text: `${result.errors.length} senza dati`, color: '#FCA5A5' })
      const detailRows = [
        ...result.enriched.map((e) => ({
          title: e.article.title,
          msg: e.filled_fields.length ? `+ ${e.filled_fields.join(', ')}` : '',
          color: '#6EE7B7',
        })),
        ...result.errors.map((e) => ({ title: e.title, msg: e.detail, color: '#FCA5A5' })),
      ]
      setToast({ kind: 'enrich', parts, detailRows })
    } catch (err) {
      setToast({ kind: 'enrich', parts: [{ text: err.message, color: '#FCA5A5' }], detailRows: [] })
    } finally {
      setEnrichingAll(false)
    }
  }

  async function handleUpdateAll() {
    setMenuOpen(false)
    setUpdatingAll(true)
    try {
      const result = await checkAllArticlesVersion(researchId)
      const updatedById = new Map(result.revised.map((r) => [r.article.id, r.article]))
      setArticles((current) => current.map((a) => updatedById.get(a.id) ?? a))
      if (result.new_sources.length > 0) {
        listDuplicateGroups(researchId)
          .then((r) => setDuplicateGroups(r.groups))
          .catch(() => {})
      }
      const parts = []
      if (result.revised.length > 0) parts.push({ text: `${result.revised.length} revisioni applicate`, color: '#D4FF24' })
      if (result.new_sources.length > 0) parts.push({ text: `${result.new_sources.length} in Deduplicazione`, color: '#FCD34D' })
      if (result.errors.length > 0) parts.push({ text: `${result.errors.length} non raggiungibili`, color: '#FCA5A5' })
      if (parts.length === 0) parts.push({ text: 'Nessuna novità', color: '#55606E' })
      const detailRows = [
        ...result.revised.map((r) => ({ title: r.article.title, msg: r.message, color: '#D4FF24' })),
        ...result.new_sources.map((n) => ({ title: n.title, msg: n.message, color: '#FCD34D' })),
        ...result.errors.map((e) => ({ title: e.title, msg: e.detail, color: '#FCA5A5' })),
      ]
      setToast({ kind: 'update', parts, detailRows })
    } catch (err) {
      setToast({ kind: 'update', parts: [{ text: err.message, color: '#FCA5A5' }], detailRows: [] })
    } finally {
      setUpdatingAll(false)
    }
  }

  const dialItems = articles.map((article, i) => ({
    id: article.id,
    caught: true,
    article,
    num: String(i + 1).padStart(2, '0'),
  }))

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Niente titolo "{nome Ricerca}" (né "Salvati"/team) qui: li mostra
          già ResearchLayout, accanto al nome della Ricerca — ripeterli qui
          duplicherebbe lo stesso contenuto. Questa riga ha solo le azioni:
          "Nuova sessione" a sinistra, "Manutenzione"/"Esporta" a destra,
          sulla stessa riga. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 4, marginBottom: 24 }}>
        <button type="button" className="pill-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={startNewSession}>
          <Logo size={18} />
          Nuova sessione
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <button type="button" className="ghost-btn" onClick={() => setMenuOpen((v) => !v)}>
              Manutenzione <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {menuOpen && (
              <div className="card maint-menu" style={{ padding: 6 }}>
                <button type="button" className="maint-item" disabled={enrichingAll} onClick={handleEnrichAll}>
                  {enrichingAll ? 'Arricchimento…' : 'Arricchisci tutti'}
                </button>
                <button type="button" className="maint-item" disabled={updatingAll} onClick={handleUpdateAll}>
                  {updatingAll ? 'Verifica…' : 'Aggiorna tutti'}
                </button>
              </div>
            )}
          </div>
          <ExportMenu researchId={researchId} onReady={handleExportReady} />
        </div>
      </div>

      {exportReady && (
        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <a href={exportReady.url} download={exportReady.filename} className="action-link" style={{ color: '#6EE7B7' }}>
            Scarica {exportReady.filename}
          </a>
        </div>
      )}

      <div className="card" style={{ marginTop: 14, padding: 0, overflow: 'visible' }}>
        <div className="ribbon-flat" style={{ fontSize: 18, paddingTop: 14, paddingBottom: 14 }}>
          Articoli salvati
          <Logo size={54} className="card-seal" />
        </div>

        {toast && (
          <div className="toast-bar" style={{ marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {toast.parts.map((p, i) => (
                <span key={i} style={{ color: p.color }}>
                  {i > 0 ? ' · ' : ''}
                  {p.text}
                </span>
              ))}
            </div>
            {toast.detailRows.length > 0 && (
              <button
                type="button"
                className="action-link"
                onClick={() =>
                  navigate(`/ricerche/${researchId}/manutenzione/${toast.kind === 'enrich' ? 'arricchisci-tutti' : 'aggiorna-tutti'}`, {
                    state: { result: { parts: toast.parts, detailRows: toast.detailRows } },
                  })
                }
              >
                Vedi dettagli →
              </button>
            )}
            <span style={{ color: '#55606E', cursor: 'pointer', flex: '0 0 auto' }} onClick={() => setToast(null)}>
              ✕
            </span>
          </div>
        )}

        <div style={{ padding: '18px 30px 22px 22px' }}>
          {loading ? (
            <p className="text-sm" style={{ color: '#8B93A5' }}>
              Caricamento…
            </p>
          ) : error ? (
            <p className="text-sm" style={{ color: '#FCA5A5' }}>
              {error}
            </p>
          ) : articles.length === 0 ? (
            <p className="text-sm" style={{ color: '#8B93A5' }}>
              Nessun articolo aggiunto per ora.
            </p>
          ) : (
            <>
              <ArticleDial
                items={dialItems}
                selectedId={selectedId}
                onSelect={selectRow}
                renderItem={(item) => (
                  <>
                    <div className="num-badge">{item.num}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        title={item.article.title}
                        style={{
                          fontSize: 14.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: '#F3F4F6',
                        }}
                      >
                        {item.article.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#8B93A5' }}>
                        {[item.article.authors?.join(', '), item.article.publication_date?.slice(0, 4)]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    </div>
                    <span
                      className="src-pill"
                      style={{
                        background: SOURCE_COLORS[item.article.source]?.bg,
                        color: SOURCE_COLORS[item.article.source]?.color,
                      }}
                    >
                      {item.article.source}
                    </span>
                  </>
                )}
              />

              {selectedArticle && (
                <div className="detail-strip">
                  <div className="detail-title">{selectedArticle.title}</div>
                  <div className="detail-actions">
                    {selectedArticle.doi && (
                      <a
                        href={`https://doi.org/${selectedArticle.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="action-link"
                        style={{ color: '#8B93A5' }}
                      >
                        DOI ↗
                      </a>
                    )}
                    <button type="button" className="action-link" disabled={actionBusy} onClick={handleEnrichSelected}>
                      Arricchisci
                    </button>
                    <button type="button" className="action-link" disabled={actionBusy} onClick={handleCheckVersionSelected}>
                      {actionBusy ? 'Verifica…' : 'Controlla versione'}
                    </button>
                    {isOwner && (
                      <button type="button" className="action-link danger" onClick={handleRemoveSelected}>
                        Rimuovi
                      </button>
                    )}
                  </div>
                  {actionMsg && <div className="detail-msg" style={{ color: actionColor }}>{actionMsg}</div>}
                </div>
              )}

              <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: '#55606E' }}>
                ↑↓ oppure rotellina/trackpad per scorrere · clicca un articolo per le sue azioni
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 280px', overflow: 'visible', padding: 0, borderColor: '#3A3410' }}>
          <div className="ribbon-flat muted">Da rivedere</div>
          <div style={{ padding: '14px 16px' }}>
            {dedupLoading ? (
              <p className="text-sm" style={{ color: '#8B93A5' }}>
                Caricamento…
              </p>
            ) : dedupError ? (
              <p className="text-sm" style={{ color: '#FCA5A5' }}>
                {dedupError}
              </p>
            ) : duplicateGroups.length === 0 ? (
              <p className="text-sm" style={{ color: '#8B93A5' }}>
                Nessun gruppo da rivedere per ora.
              </p>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#D4FF24', fontWeight: 600 }}>
                  {duplicateGroups.length} grupp{duplicateGroups.length === 1 ? 'o' : 'i'} di duplicati
                </div>
                <div style={{ fontSize: 11.5, color: '#8B93A5', marginTop: 2 }}>
                  su tutta la Ricerca, non solo gli articoli appena aggiunti
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ flex: '2 1 420px', overflow: 'visible', padding: 0 }}>
          <div className="ribbon-flat">Attività</div>
          {/* minmax(0,1fr), non 1fr semplice: senza, la larghezza minima di
              ogni traccia è quella del suo contenuto (min-content) — un
              nome di query lungo farebbe sbordare la card oltre la pagina
              invece di essere troncato, stesso bug già risolto nel pannello
              di ricerca (Y). */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
            <div style={{ padding: '12px 16px', borderRight: '1px solid #1B2130', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: '#55606E', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Query salvate
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/ricerche/${researchId}/query-salvate`)}
                  title="Vedi elenco completo"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9CC2FF', display: 'flex' }}
                >
                  <ArrowUpRightIcon />
                </button>
              </div>
              {queriesLoading ? (
                <p className="text-xs" style={{ color: '#8B93A5' }}>
                  Caricamento…
                </p>
              ) : queriesError ? (
                <p className="text-xs" style={{ color: '#FCA5A5' }}>
                  {queriesError}
                </p>
              ) : queries.length === 0 ? (
                <p className="text-xs" style={{ color: '#55606E' }}>
                  Nessuna query salvata per ora.
                </p>
              ) : (
                <ul className="compact-rows">
                  {queries.slice(0, QUERIES_PREVIEW_COUNT).map((query) => (
                    <QueryListItem key={query.id} query={query} />
                  ))}
                </ul>
              )}
            </div>
            <div style={{ padding: '12px 16px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: '#55606E', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Cronologia
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/ricerche/${researchId}/cronologia`)}
                  title="Vedi cronologia completa"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9CC2FF', display: 'flex' }}
                >
                  <ArrowUpRightIcon />
                </button>
              </div>
              {historyLoading ? (
                <p className="text-xs" style={{ color: '#8B93A5' }}>
                  Caricamento…
                </p>
              ) : historyError ? (
                <p className="text-xs" style={{ color: '#FCA5A5' }}>
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className="text-xs" style={{ color: '#55606E' }}>
                  Nessuna aggiunta registrata per ora.
                </p>
              ) : (
                <ul className="compact-rows">
                  {history.map((entry) => (
                    <HistoryEntryItem key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Team ha qui solo lo stack di avatar accanto al nome della Ricerca
          (cliccabile verso /team) — niente più un'anteprima dei membri
          ripetuta anche qui sotto. "Statistiche" rimossa: era solo un
          placeholder "In arrivo.", nessun contenuto reale dietro. */}
    </div>
  )
}
