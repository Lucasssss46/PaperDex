import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createRicercaQuery, listRicercaQueries } from '../api/ricerche'
import { getKeyStatus, searchArticles } from '../api/search'
import KeywordsPanel from '../components/KeywordsPanel'
import QueryListItem from '../components/QueryListItem'
import SearchForm from '../components/SearchForm'
import SearchResults from '../components/SearchResults'
import SourcesPanel from '../components/SourcesPanel'
import { ALL_SOURCES } from '../constants'

// Una query "usata" da Query salvate arriva qui come stato di navigazione
// (vedi SavedQueriesPage.jsx): letta negli inizializzatori di useState, così
// da precompilare il form una sola volta, al montaggio della pagina.
function useIncomingQuery() {
  const location = useLocation()
  return location.state?.applyQuery ?? null
}

// Nome leggibile generato per il salvataggio automatico della query (non c'è
// più un form manuale in cui l'utente possa sceglierne uno).
function buildAutoQueryName({ keyword_include, author, journal }) {
  if (keyword_include?.length) {
    const terms = keyword_include[0].join(', ')
    return terms.length > 60 ? `${terms.slice(0, 57)}…` : terms
  }
  if (author?.length) return `Autori: ${author.join(', ')}`
  if (journal?.length) return `Venue: ${journal.join(', ')}`
  return `Query del ${new Date().toLocaleDateString('it-IT')}`
}

export default function SearchArticlesPage({ research, sessionArticles = [], onSessionAdd }) {
  const incomingQuery = useIncomingQuery()

  // Query salvate della Ricerca, mostrate qui (non solo nella loro pagina
  // dedicata) per averle a portata di mano mentre si cerca — l'utente ha
  // chiesto esplicitamente "un accesso facile" da questa stessa pagina.
  const [savedQueries, setSavedQueries] = useState([])
  useEffect(() => {
    if (!research) return
    listRicercaQueries(research.id)
      .then((data) => setSavedQueries(data.queries))
      .catch(() => {})
  }, [research])

  const [keywordGroups, setKeywordGroups] = useState(() =>
    incomingQuery?.keyword_include?.length ? incomingQuery.keyword_include : [[]],
  )
  const [sources, setSources] = useState(() =>
    incomingQuery?.sources?.length ? incomingQuery.sources : ALL_SOURCES,
  )
  const [authors, setAuthors] = useState(incomingQuery?.author ?? [])
  const [excludeTerms, setExcludeTerms] = useState(incomingQuery?.keyword_exclude ?? [])
  const [journals, setJournals] = useState(incomingQuery?.journal ?? [])
  const [yearStart, setYearStart] = useState(
    incomingQuery?.year_start != null ? String(incomingQuery.year_start) : '',
  )
  const [yearEnd, setYearEnd] = useState(incomingQuery?.year_end != null ? String(incomingQuery.year_end) : '')
  const [depth, setDepth] = useState(incomingQuery?.depth ?? 'media')

  // A differenza di "Usa" da Query salvate/Overview (che naviga qui con lo
  // stato di router e ripopola il form solo al montaggio), qui si è già
  // sulla pagina: riapplica i campi direttamente sugli stessi setter usati
  // dagli inizializzatori sopra.
  function applyQuery(query) {
    setKeywordGroups(query.keyword_include?.length ? query.keyword_include : [[]])
    setSources(query.sources?.length ? query.sources : ALL_SOURCES)
    setAuthors(query.author ?? [])
    setExcludeTerms(query.keyword_exclude ?? [])
    setJournals(query.journal ?? [])
    setYearStart(query.year_start != null ? String(query.year_start) : '')
    setYearEnd(query.year_end != null ? String(query.year_end) : '')
    setDepth(query.depth ?? 'media')
  }

  // Sorgenti selezionabili ma inutilizzabili senza chiave API (oggi OpenAlex):
  // il pannello Sorgenti avvisa se sono spuntate. Un errore qui non blocca la
  // ricerca, toglie solo l'avviso preventivo (resta quello nei risultati).
  const [keyStatus, setKeyStatus] = useState({ loggedIn: false, missingKeys: [] })
  useEffect(() => {
    getKeyStatus(research?.id)
      .then((data) => setKeyStatus({ loggedIn: data.logged_in, missingKeys: data.missing_keys }))
      .catch(() => {})
  }, [research])

  const [sourcesError, setSourcesError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [results, setResults] = useState([])
  const [count, setCount] = useState(0)
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  // Vero dal momento in cui la query corrente viene salvata automaticamente
  // (primo articolo aggiunto alla Ricerca), fino alla prossima ricerca
  // eseguita: evita di risalvare ad ogni articolo aggiunto dagli stessi
  // risultati. Un ref, non uno stato: non deve causare un re-render.
  const autoSavedRef = useRef(false)

  function currentQueryPayload() {
    const cleanGroups = keywordGroups.map((g) => g.filter(Boolean)).filter((g) => g.length > 0)
    return {
      keyword_include: cleanGroups.length ? cleanGroups : null,
      keyword_exclude: excludeTerms.length ? excludeTerms : null,
      author: authors.length ? authors : null,
      year_start: yearStart ? Number(yearStart) : null,
      year_end: yearEnd ? Number(yearEnd) : null,
      journal: journals.length ? journals : null,
      depth,
      sources: sources.length < ALL_SOURCES.length ? sources : null,
    }
  }

  function updateGroup(index, terms) {
    setKeywordGroups((groups) => groups.map((g, i) => (i === index ? terms : g)))
  }

  function addGroup() {
    setKeywordGroups((groups) => [...groups, []])
  }

  // Usato dall'espansione semantica (✨): ogni sinonimo/acronimo suggerito è
  // un'alternativa al termine originale, non un requisito aggiuntivo — deve
  // finire in una sua sezione OR separata, non dentro quella esistente
  // (altrimenti verrebbe messo in AND con gli altri termini del gruppo).
  function addGroups(newGroups) {
    setKeywordGroups((groups) => [...groups, ...newGroups])
  }

  function removeGroup(index) {
    setKeywordGroups((groups) => groups.filter((_, i) => i !== index))
  }

  function toggleSource(name) {
    setSources((current) => (current.includes(name) ? current.filter((s) => s !== name) : [...current, name]))
  }

  async function handleFormSubmit(formValues) {
    const cleanGroups = keywordGroups.map((g) => g.filter(Boolean)).filter((g) => g.length > 0)

    let hasError = false
    if (cleanGroups.length === 0 && formValues.author.length === 0 && formValues.journal.length === 0) {
      setValidationError('Inserisci almeno una keyword, un autore o una venue.')
      hasError = true
    } else {
      setValidationError('')
    }
    if (sources.length === 0) {
      setSourcesError('Seleziona almeno una sorgente.')
      hasError = true
    } else {
      setSourcesError('')
    }
    if (hasError) return

    // Nuova ricerca: se in futuro si aggiungerà un articolo dai suoi
    // risultati, va di nuovo considerata "da salvare automaticamente".
    autoSavedRef.current = false

    setLoading(true)
    setError('')
    setSearched(true)
    setWarnings([])

    try {
      const data = await searchArticles({
        ...formValues,
        keywordInclude: cleanGroups,
        sources: sources.length < ALL_SOURCES.length ? sources : null,
        ricercaId: research?.id,
      })
      setResults(data.results)
      setCount(data.count)
      setWarnings(data.warnings ?? [])
    } catch (err) {
      setError(err.message)
      setResults([])
      setCount(0)
    } finally {
      setLoading(false)
    }
  }

  // A differenza del salvataggio automatico della query (sotto, solo al
  // primo articolo), la sessione va aggiornata ad ogni aggiunta: serve a
  // sapere per intero cosa è stato toccato in questa sessione quando si
  // passa a rivedere i duplicati o ad arricchire con Zotero.
  function handleArticleAdded(articles) {
    onSessionAdd?.(articles)
    maybeAutoSaveQuery()
  }

  async function maybeAutoSaveQuery() {
    if (!research || autoSavedRef.current) return
    // Segnato subito, non solo in caso di successo: un secondo articolo
    // aggiunto poco dopo non deve ritentare mentre il primo salvataggio è
    // ancora in corso, né riprovare se quello è fallito silenziosamente.
    autoSavedRef.current = true

    const payload = currentQueryPayload()
    try {
      const saved = await createRicercaQuery(research.id, { name: buildAutoQueryName(payload), ...payload })
      // Il pannello "Query salvate" qui sopra deve mostrarla subito, non solo
      // dopo un ricaricamento della pagina. Se questa stessa ricerca era già
      // stata salvata in precedenza, il backend restituisce quella
      // esistente invece di crearne una nuova (niente doppioni): va quindi
      // aggiunta qui solo se non è già nell'elenco mostrato.
      setSavedQueries((current) => (current.some((q) => q.id === saved.id) ? current : [saved, ...current]))
    } catch (err) {
      // Salvataggio implicito, non un'azione esplicitamente richiesta in
      // quel momento (l'utente ha cliccato "Aggiungi alla ricerca", non
      // "Salva query"): un suo fallimento non deve interrompere né sporcare
      // il flusso di aggiunta articoli con un errore inatteso.
      console.warn('Salvataggio automatico della query fallito:', err.message)
    }
  }

  return (
    <>
      {!research && (
        <>
          <h2 className="head mb-4 text-xl font-semibold" style={{ color: '#F3F4F6' }}>
            Ricerca rapida
          </h2>
          <div className="mb-6 rounded-lg px-4 py-2.5 text-sm" style={{ border: '1px solid #1B2130', background: '#0C1119', color: '#8B93A5' }}>
            Sei fuori da qualsiasi Ricerca, qui puoi solo cercare gli articoli, non salvarli.
          </div>
        </>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <SourcesPanel
          sources={sources}
          onToggle={toggleSource}
          error={sourcesError}
          missingKeys={keyStatus.missingKeys}
          loggedIn={keyStatus.loggedIn}
        />
        <KeywordsPanel
          groups={keywordGroups}
          onUpdateGroup={updateGroup}
          onAddGroup={addGroup}
          onAddGroups={addGroups}
          onRemoveGroup={removeGroup}
        />
        <SearchForm
          authors={authors}
          onAuthorsChange={setAuthors}
          excludeTerms={excludeTerms}
          onExcludeTermsChange={setExcludeTerms}
          journals={journals}
          onJournalsChange={setJournals}
          yearStart={yearStart}
          onYearStartChange={setYearStart}
          yearEnd={yearEnd}
          onYearEndChange={setYearEnd}
          depth={depth}
          onDepthChange={setDepth}
          onSubmit={handleFormSubmit}
        />
        {research && (
          <aside className="card min-w-0" style={{ padding: 0, flex: '1 1 0' }}>
            <div className="ribbon-flat">Query salvate</div>
            <div style={{ padding: '10px 12px', maxHeight: 280, overflowY: 'auto' }}>
              {savedQueries.length === 0 ? (
                <p className="text-xs" style={{ color: '#55606E' }}>
                  Nessuna query salvata per ora.
                </p>
              ) : (
                savedQueries.map((query) => (
                  <QueryListItem key={query.id} query={query} onUse={() => applyQuery(query)} />
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 border-t pt-6" style={{ borderColor: '#1B2130' }}>
        {validationError && (
          <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#FCA5A5' }}>
            {validationError}
          </p>
        )}
        <button
          type="submit"
          form="search-form"
          disabled={loading}
          className="pill-btn flex w-full max-w-[160px] items-center justify-center gap-2"
        >
          {loading ? 'Ricerca in corso…' : 'Cerca'}
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mt-6 space-y-2">
          {warnings.map((w) => (
            <p key={w.source} className="rounded-lg px-4 py-2.5 text-sm" style={{ background: 'rgba(217,119,6,.1)', color: '#FCD34D' }}>
              <strong>{w.source}:</strong> {w.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-8">
        <SearchResults
          results={results}
          count={count}
          loading={loading}
          error={error}
          searched={searched}
          research={research}
          onArticleAdded={handleArticleAdded}
        />
      </div>

      {/* Barra di sessione, in fondo come nelle altre pagine della sessione:
          compare solo dopo il primo articolo aggiunto in questa visita (vedi
          "Inizia una nuova sessione" in ResearchLayout). Un solo passo avanti
          possibile (Duplicati, mai direttamente Zotero): percorso lineare
          forzato, richiesto esplicitamente dall'utente — da qui in poi non si
          torna all'Overview senza passare anche da Deduplicazione e
          Arricchisci con Zotero. */}
      {research && sessionArticles.length > 0 && (
        <div
          className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
          style={{ border: '1px solid rgba(212,255,36,.25)', background: 'rgba(212,255,36,.08)' }}
        >
          <span className="text-sm font-medium" style={{ color: '#D4FF24' }}>
            {sessionArticles.length} articol{sessionArticles.length === 1 ? 'o' : 'i'} aggiunt
            {sessionArticles.length === 1 ? 'o' : 'i'} in questa sessione
          </span>
          <Link to={`/ricerche/${research.id}/sessione/duplicati`} className="pill-btn" style={{ textDecoration: 'none' }}>
            Continua: rivedi duplicati →
          </Link>
        </div>
      )}
    </>
  )
}
