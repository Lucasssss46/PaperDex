import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getRicerca } from '../api/ricerche'
import BackLink from './BackLink'
import SessionStepper from './SessionStepper'

// Ogni Ricerca ha le proprie query salvate e il proprio team: queste due
// pagine, come la ricerca vera e propria, sono raggiungibili solo dall'interno
// dell'Overview (anteprima + "Vedi tutti"), non più da una barra di tab qui.

// L'Overview è la pagina "principale" della Ricerca (nessun suffisso, resta
// il bottone "+ Inizia una nuova sessione"); le altre sono pagine secondarie:
// niente bottone (su "Cerca" linkerebbe alla pagina stessa), solo il nome
// della pagina accanto a quello della Ricerca.
const PAGE_NAMES = {
  cerca: 'Cerca',
  'query-salvate': 'Query salvate',
  cronologia: 'Cronologia',
  deduplicazione: 'Deduplicazione',
  team: 'Team',
  duplicati: 'Duplicati della sessione',
  arricchisci: 'Arricchisci con Zotero',
}

export default function ResearchLayout() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [name, setName] = useState(null)
  const [error, setError] = useState('')

  // Articoli aggiunti dall'ultimo "Inizia una nuova sessione" in poi (oggetti
  // Article completi, non solo id: evita di doverli rileggere dal server nelle
  // pagine di revisione della sessione). Vive qui, non nella pagina di ricerca
  // stessa, perché deve sopravvivere alla navigazione avanti e indietro tra
  // Cerca/Duplicati/Arricchisci (percorso lineare forzato, vedi PAGE_NAMES
  // sotto) — tutte sotto questo stesso layout, che non si smonta finché si
  // resta dentro questa Ricerca.
  const [sessionArticles, setSessionArticles] = useState([])

  // Selezione e risultati dell'arricchimento Zotero della sessione: vivono
  // qui (non in SessionEnrichPage) per lo stesso motivo — altrimenti
  // tornando indietro a Duplicati e poi di nuovo avanti a Arricchisci, la
  // pagina si rimonterebbe da zero perdendo sia le caselle spuntate sia gli
  // esiti già ottenuti. Tenuto come insieme degli ESCLUSI (non degli
  // inclusi): un articolo è selezionato semplicemente perché non vi
  // compare, quindi uno nuovo (aggiunto tornando a Cerca) è selezionato di
  // default senza bisogno di nessuna sincronizzazione — l'alternativa
  // (insieme dei selezionati, con "aggiungi i nuovi arrivati" ad ogni
  // mount) non riusciva a distinguere "mai visto, va aggiunto" da
  // "deselezionato apposta dall'utente", riselezionando per errore un
  // articolo appena tolto.
  const [enrichExcluded, setEnrichExcluded] = useState(new Set())
  const [enrichResults, setEnrichResults] = useState({})

  function addToSession(articles) {
    setSessionArticles((current) => {
      const byId = new Map(current.map((a) => [a.id, a]))
      for (const article of articles) byId.set(article.id, article)
      return Array.from(byId.values())
    })
  }

  function startNewSession() {
    setSessionArticles([])
    setEnrichExcluded(new Set())
    setEnrichResults({})
    navigate(`/ricerche/${id}/cerca`)
  }

  useEffect(() => {
    getRicerca(id)
      .then((data) => setName(data.name))
      .catch((err) => setError(err.message))
  }, [id])

  if (error) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-red-600 dark:text-red-400">{error}</p>
  }

  const currentSegment = location.pathname.split('/').pop()
  const pageName = PAGE_NAMES[currentSegment]

  // Percorso guidato forzato (richiesta esplicita dell'utente): una volta
  // aggiunto almeno un articolo in questa sessione, l'unica via per tornare
  // all'Overview è completare Cerca → Duplicati → Arricchisci per intero —
  // niente scorciatoia "Torna a Overview" su nessuna delle tre. Su Cerca
  // stessa la scorciatoia resta finché non si è aggiunto nulla (si può
  // sempre abbandonare una ricerca ancora vuota).
  const inForcedSessionFlow =
    currentSegment === 'duplicati' ||
    currentSegment === 'arricchisci' ||
    (currentSegment === 'cerca' && sessionArticles.length > 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/ricerche/${id}/overview`}
            className="text-xl font-semibold text-neutral-900 hover:underline dark:text-neutral-50"
          >
            {name ?? 'Caricamento…'}
          </Link>
          {pageName && (
            <span className="text-xl font-semibold text-neutral-400 dark:text-neutral-500"> - {pageName}</span>
          )}

          {!pageName && (
            <div className="mt-3">
              <button
                type="button"
                onClick={startNewSession}
                className="inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
              >
                + Inizia una nuova sessione
              </button>
            </div>
          )}
        </div>

        {/* Sulle sotto-pagine (Cronologia, Deduplicazione, Team, Query
            salvate) risale all'Overview di questa Ricerca; sull'Overview
            stessa risale all'elenco delle Ricerche — un salto diretto, senza
            passare dal pulsante "Ricerche" della barra di navigazione o dal
            tasto indietro del browser. Assente durante il percorso guidato
            forzato (sopra): lì si risale solo con "Indietro"/"Fine" dentro
            la pagina stessa. */}
        {name !== null &&
          !inForcedSessionFlow &&
          (pageName ? (
            <BackLink to={`/ricerche/${id}/overview`} label="Overview" />
          ) : (
            <BackLink to="/ricerche" label="Ricerche" />
          ))}
      </div>

      {name !== null && <SessionStepper researchId={id} currentSegment={currentSegment} />}

      {name !== null && (
        <Outlet
          context={{
            researchId: id,
            researchName: name,
            sessionArticles,
            addToSession,
            enrichExcluded,
            setEnrichExcluded,
            enrichResults,
            setEnrichResults,
          }}
        />
      )}
    </div>
  )
}
