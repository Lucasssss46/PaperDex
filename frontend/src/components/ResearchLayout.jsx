import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { getRicerca, listRicercaArticles, listRicercaTeam } from '../api/ricerche'
import BackLink from './BackLink'
import SessionStepper from './SessionStepper'

const AVATAR_COLORS = ['#2B7CFF', '#9D174D', '#0E7490']

function initials(name) {
  return (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

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
  'arricchisci-tutti': 'Dettagli arricchimento',
  'aggiorna-tutti': 'Dettagli aggiornamento',
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

  // Team e conteggio articoli: vivono qui (non in OverviewPage) perché
  // "SALVATI" e lo stack di avatar vanno accanto al nome della Ricerca,
  // che questo layout mostra — non sulla pagina sotto. `isOwner` resta
  // comunque utile anche alle sotto-pagine (es. il permesso di "Rimuovi"
  // in Overview), quindi passato giù via contesto a prescindere.
  const [team, setTeam] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [articlesCount, setArticlesCount] = useState(0)

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

  // Solo sull'Overview (nessun `pageName`): le altre sotto-pagine non
  // mostrano questa riga, non serve richiamarla ad ogni cambio pagina.
  // Conteggio con `pageSize:1` (non l'elenco intero, già a carico della
  // ruota in OverviewPage): qui serve solo il numero.
  useEffect(() => {
    const segment = location.pathname.split('/').pop()
    if (PAGE_NAMES[segment]) return
    listRicercaTeam(id)
      .then((result) => {
        setTeam(result.members)
        setIsOwner(result.is_owner)
      })
      .catch(() => {})
    listRicercaArticles(id, { page: 1, pageSize: 1 })
      .then((result) => setArticlesCount(result.count))
      .catch(() => {})
  }, [id, location.pathname])

  if (error) {
    return (
      <p className="mx-auto max-w-3xl px-4 py-8 text-sm" style={{ color: '#FCA5A5' }}>
        {error}
      </p>
    )
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
        <div className="flex flex-wrap items-center gap-3.5">
          <Link to={`/ricerche/${id}/overview`} className="head text-xl font-semibold hover:underline" style={{ color: '#F3F4F6' }}>
            {name ?? 'Caricamento…'}
          </Link>
          {pageName && <span className="head text-xl font-semibold" style={{ color: '#55606E' }}>- {pageName}</span>}

          {/* "Salvati" + team: solo sull'Overview (vedi l'effetto sopra),
              accanto al nome della Ricerca invece che su una riga propria
              più in basso. */}
          {!pageName && (
            <div
              className="head"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: '1.5px solid #1B2130',
                borderRadius: 999,
                padding: '5px 14px',
                fontSize: 12,
                color: '#8B93A5',
              }}
            >
              <span>
                SALVATI <strong style={{ color: '#D4FF24', fontSize: 13 }}>{articlesCount}</strong>
              </span>
            </div>
          )}
          {!pageName && team.length > 0 && (
            <button
              type="button"
              onClick={() => navigate(`/ricerche/${id}/team`)}
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              title={`Team: ${team.map((m) => m.name).join(', ')} — vai alla pagina Team`}
            >
              {team.slice(0, 3).map((m, i) => (
                <div key={m.id} className="avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], marginRight: -8, zIndex: 3 - i }}>
                  {initials(m.name)}
                </div>
              ))}
              {team.length > 3 && (
                <div className="avatar" style={{ background: '#1B2130', color: '#8B93A5' }}>
                  +{team.length - 3}
                </div>
              )}
            </button>
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
            isOwner,
            sessionArticles,
            addToSession,
            startNewSession,
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
