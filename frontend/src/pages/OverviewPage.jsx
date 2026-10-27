import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  enrichAllArticles,
  listDuplicateGroups,
  listRicercaArticles,
  listRicercaCronologia,
  listRicercaQueries,
  listRicercaTeam,
  removeRicercaArticle,
} from '../api/ricerche'
import ArticleListItem from '../components/ArticleListItem'
import ExportMenu from '../components/ExportMenu'
import HistoryEntryItem from '../components/HistoryEntryItem'
import QueryListItem from '../components/QueryListItem'
import TeamMemberItem from '../components/TeamMemberItem'

const PAGE_SIZE = 20
const TEAM_PREVIEW_COUNT = 5
const HISTORY_PREVIEW_COUNT = 5
const QUERIES_PREVIEW_COUNT = 5

function SidebarSection({ title, viewAllTo, children }) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">{title}</h3>
        {viewAllTo && (
          <Link to={viewAllTo} className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">
            Vedi tutti →
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function OverviewPage() {
  const { researchId } = useOutletContext()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [enrichingAll, setEnrichingAll] = useState(false)
  const [enrichAllMessage, setEnrichAllMessage] = useState('')

  // Sollevato da ExportMenu (che genera il file ma non mostra più il link
  // lui stesso): così il link può stare su una riga propria sotto l'intera
  // barra "Articoli salvati", allineata a destra, invece che incollato solo
  // sotto il bottone "Esporta".
  const [exportReady, setExportReady] = useState(null)

  // Libera l'URL blob precedente quando se ne prepara uno nuovo o si lascia
  // la pagina, invece di lasciarlo vivere in memoria inutilizzato.
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

  const [team, setTeam] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError] = useState('')

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  const [queries, setQueries] = useState([])
  const [queriesLoading, setQueriesLoading] = useState(true)
  const [queriesError, setQueriesError] = useState('')

  const [duplicateGroups, setDuplicateGroups] = useState([])
  const [dedupLoading, setDedupLoading] = useState(true)
  const [dedupError, setDedupError] = useState('')

  useEffect(() => {
    listRicercaArticles(researchId, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        setData(result)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId, page])

  useEffect(() => {
    listRicercaTeam(researchId)
      .then((result) => {
        setTeam(result.members)
        setIsOwner(result.is_owner)
      })
      .catch((err) => setTeamError(err.message))
      .finally(() => setTeamLoading(false))
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

  function goToPage(newPage) {
    setLoading(true)
    setPage(newPage)
  }

  function handleUseQuery(query) {
    navigate(`/ricerche/${researchId}/cerca`, { state: { applyQuery: query } })
  }

  async function handleRemoveArticle(articleId) {
    try {
      await removeRicercaArticle(researchId, articleId)
      setData((current) => ({
        ...current,
        count: current.count - 1,
        articles: current.articles.filter((a) => a.id !== articleId),
      }))
    } catch (err) {
      setError(err.message)
    }
  }

  function handleArticleEnriched(articleId, updatedArticle) {
    setData((current) => ({
      ...current,
      articles: current.articles.map((a) => (a.id === articleId ? updatedArticle : a)),
    }))
  }

  async function handleEnrichAll() {
    setEnrichingAll(true)
    setEnrichAllMessage('')
    try {
      const result = await enrichAllArticles(researchId)
      const updatedById = new Map(result.enriched.map((e) => [e.article.id, e.article]))
      // Copre l'intera Ricerca, non solo la pagina corrente: aggiorna quelli
      // già visibili qui, gli altri si vedranno arricchiti passando pagina.
      setData((current) => ({
        ...current,
        articles: current.articles.map((a) => updatedById.get(a.id) ?? a),
      }))
      const parts = [`${result.enriched.length} di ${result.total} articoli arricchiti`]
      if (result.errors.length > 0) {
        parts.push(`${result.errors.length} senza dati trovati`)
      }
      setEnrichAllMessage(parts.join(', '))
    } catch (err) {
      setEnrichAllMessage(err.message)
    } finally {
      setEnrichingAll(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      {/* Contenuto principale: gli articoli salvati sono il concetto centrale dell'Overview. */}
      <section className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Articoli salvati</h3>
          {data && data.count > 0 && (
            <div className="flex items-start gap-3">
              <span className="pt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                {data.count} {data.count === 1 ? 'articolo salvato' : 'articoli salvati'}
              </span>
              <div className="flex flex-col items-end">
                <button
                  type="button"
                  onClick={handleEnrichAll}
                  disabled={enrichingAll}
                  title="Completa i metadati mancanti di tutti gli articoli salvati tramite Zotero"
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {enrichingAll ? 'Arricchimento…' : 'Arricchisci tutti'}
                </button>
                {enrichingAll && !enrichAllMessage && (
                  <p className="mt-1 max-w-[12rem] text-right text-xs text-neutral-400 dark:text-neutral-500">
                    Può richiedere qualche decina di secondi.
                  </p>
                )}
                {enrichAllMessage && (
                  <p className="mt-1 max-w-[12rem] text-right text-xs text-neutral-500 dark:text-neutral-400">
                    {enrichAllMessage}
                  </p>
                )}
              </div>
              <ExportMenu researchId={researchId} onReady={handleExportReady} />
            </div>
          )}
        </div>

        {/* Riga propria, allineata a destra sotto l'intera barra (non solo
            sotto "Esporta"): il nome del file esportato resta per intero
            (nessun troncamento — va comunque a capo se davvero troppo
            lungo, non trabocca), senza spingere lateralmente conteggio
            articoli e "Arricchisci tutti" sulla riga sopra. */}
        {exportReady && (
          <div className="mt-1 flex justify-end">
            <a
              href={exportReady.url}
              download={exportReady.filename}
              className="block max-w-full rounded-lg bg-emerald-100 px-3 py-1.5 text-right text-xs font-medium text-emerald-700 hover:underline dark:bg-emerald-500/20 dark:text-emerald-300"
            >
              Scarica {exportReady.filename}
            </a>
          </div>
        )}

        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : data.count === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nessun articolo aggiunto per ora.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {data.articles.map((article, index) => (
                  <ArticleListItem
                    key={article.id ?? index}
                    article={article}
                    researchId={researchId}
                    onRemove={isOwner ? handleRemoveArticle : undefined}
                    onEnriched={handleArticleEnriched}
                  />
                ))}
              </ul>

              {data.total_pages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    ← Precedente
                  </button>
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">
                    Pagina {data.page} di {data.total_pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= data.total_pages}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Successiva →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Il resto vive in una sidebar: informazioni di contorno, non il focus principale. */}
      <div className="min-w-0 space-y-6">
        {/* Statistiche: contenuto da definire in seguito, per ora solo un placeholder. */}
        <SidebarSection title="Statistiche">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">In arrivo.</p>
        </SidebarSection>

        <SidebarSection title="Query salvate" viewAllTo={`/ricerche/${researchId}/query-salvate`}>
          {queriesLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : queriesError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{queriesError}</p>
          ) : queries.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nessuna query salvata per ora.</p>
          ) : (
            <ul className="space-y-2">
              {queries.slice(0, QUERIES_PREVIEW_COUNT).map((query) => (
                <QueryListItem key={query.id} query={query} onUse={() => handleUseQuery(query)} />
              ))}
            </ul>
          )}
        </SidebarSection>

        <SidebarSection title="Cronologia" viewAllTo={`/ricerche/${researchId}/cronologia`}>
          {historyLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : historyError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nessuna aggiunta registrata per ora.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <HistoryEntryItem key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </SidebarSection>

        <SidebarSection title="Deduplicazione" viewAllTo={`/ricerche/${researchId}/deduplicazione`}>
          {dedupLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : dedupError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{dedupError}</p>
          ) : duplicateGroups.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Nessun gruppo da rivedere per ora.</p>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {duplicateGroups.length} grupp{duplicateGroups.length === 1 ? 'o' : 'i'} di duplicati da rivedere.
            </p>
          )}
        </SidebarSection>

        <SidebarSection title="Team" viewAllTo={`/ricerche/${researchId}/team`}>
          {teamLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : teamError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{teamError}</p>
          ) : (
            <ul className="space-y-2">
              {team.slice(0, TEAM_PREVIEW_COUNT).map((member) => (
                <TeamMemberItem key={member.id} member={member} />
              ))}
            </ul>
          )}
        </SidebarSection>
      </div>
    </div>
  )
}
