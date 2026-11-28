import { useEffect, useState } from 'react'

// Frasi del box di dialogo, scritte per PapérDex (nessuna citazione dei giochi).
const ENRICH_LINES = [
  'Un DOI selvatico è apparso!',
  'Zotero usa Arricchimento… è superefficace!',
  'Sto lucidando i metadati…',
  'Consulto il Professore sugli abstract…',
  'Gli autori sono stati catturati!',
  "L'abstract si nasconde nell'erba alta. Cerco meglio…",
  'Lancio una Paper Ball… uno… due… tre…',
  'Scrivo nel PapérDex…',
  'Un editore selvatico vuole lottare!',
  'Allineo le virgole della bibliografia, una a una…',
  'Il numero di pagine ha imparato una nuova mossa!',
  'Chiedo al centro Zotero di curare i campi vuoti…',
  'Zotero è confuso! No, sta solo pensando…',
  'Sfoglio la rivista come un professore assonnato…',
  'Il DOI ha usato Teletrasporto. Lo inseguo…',
  'Riordino il box degli autori…',
]
const UPDATE_LINES = [
  'Controllo se il preprint si è evoluto in articolo…',
  'La venue sta evolvendo…',
  'Cosa? Il preprint si sta evolvendo!',
  "Cerco nuove versioni nell'erba alta…",
  'Confronto la v1 con la v2… sembrano gemelli.',
  'Un DOI selvatico è apparso!',
  'Consulto il Professore sulle revisioni…',
  'Il preprint ha usato Pubblicazione… è superefficace!',
  'Chiedo a Crossref se qualcuno ha pubblicato di nascosto…',
  'Scrivo nel PapérDex…',
  'Una versione rara si aggira tra le sorgenti!',
  'Controllo la data: è più giovane o più vecchio?',
  'Gli autori sono stati catturati… di nuovo.',
  'Zotero è confuso! No, sta solo pensando…',
  'Sfoglio gli archivi come un professore assonnato…',
  'Il numero di versione ha imparato una nuova mossa!',
]
const SEARCH_LINES = [
  'Un articolo selvatico è apparso!',
  'arXiv usa Preprint… è molto efficace!',
  "Esploro l'erba alta di Crossref…",
  'Lancio una Paper Ball su cinque sorgenti insieme…',
  'DBLP usa Pazienza. Funziona!',
  'Semantic Scholar ha imparato Citazione!',
  'OpenAlex è stanco… ma tiene duro.',
  'Un preprint fugge! No, eccolo qui.',
  "Gotta find 'em all!",
  'Separo i gemelli: stesso titolo, sorgenti diverse…',
  'Conto gli autori… ieri erano di meno.',
  'Una rivista rara si nasconde in fondo ai risultati!',
  "Il PapérDex vibra: c'è qualcosa nei paraggi…",
  'Crossref usa Indicizzazione… colpo critico!',
]
// Consigli veri (verificati nel codice): validi ovunque si cerchi…
const TIPS_COMMON = [
  'Consiglio: i termini di uno stesso gruppo devono comparire tutti; tra gruppi alternativi (OR) ne basta uno.',
  "Lo sapevi? Le parole chiave si cercano nel titolo e nell'abstract degli articoli.",
  'Consiglio: titoli e abstract sono quasi sempre in inglese, quindi cerca con termini in inglese.',
  'Consiglio: la profondità bassa è la più veloce: fino a 15 articoli per sorgente.',
  'Consiglio: in "Filtri avanzati" trovi venue, intervallo di anni e termini da escludere.',
  'Lo sapevi? Le versioni dello stesso articolo trovate su più sorgenti stanno in una sola riga, col badge ×N.',
  "Lo sapevi? arXiv, DBLP, OpenAlex e Semantic Scholar sono limitati all'informatica; Crossref copre tutte le discipline.",
  'Consiglio: clicca il titolo di un articolo per aprire la scheda con abstract e DOI.',
]
// …solo dentro una Ricerca…
const TIPS_RESEARCH = [
  ...TIPS_COMMON,
  "Consiglio: clicca il pallino o il numero di una riga per selezionare l'articolo.",
  'Lo sapevi? Gli articoli entrano nella Ricerca solo quando passi alla deduplicazione.',
  'Lo sapevi? La query si salva da sola quando aggiungi articoli: la rilanci con "Usa" tra le query salvate.',
  'Consiglio: ✨ propone sinonimi e forme estese degli acronimi; con un modello linguistico in Chiavi API i suggerimenti migliorano.',
  'Consiglio: OpenAlex richiede una chiave API, e da Chiavi API puoi condividere la tua con il team.',
  'Lo sapevi? La Cronologia della Ricerca mostra chi ha aggiunto ogni articolo, e quando.',
  "Consiglio: dall'Overview esporti in BibTeX o RIS, i formati che leggono Zotero, Mendeley e JabRef.",
  'Lo sapevi? In Deduplicazione il proprietario ordina le sorgenti preferite trascinandole.',
]
// …o nella ricerca rapida e pubblica, dove non si salva.
const TIPS_QUICK = [
  ...TIPS_COMMON,
  'Consiglio: per salvare gli articoli serve una Ricerca: accedi e creane una dalla pagina Ricerche.',
]

// Serie di frasi per tipo; con due serie si alternano (giocosa, consiglio, giocosa…).
const SETS = {
  enrich: [ENRICH_LINES],
  update: [UPDATE_LINES],
  search: [SEARCH_LINES, TIPS_RESEARCH],
  'search-quick': [SEARCH_LINES, TIPS_QUICK],
}
const WAIT_LINES = {
  enrich: 'Il server di Zotero si sta svegliando: può servire fino a un minuto…',
  update: 'Il server di Zotero si sta svegliando: può servire fino a un minuto…',
  search: 'Le sorgenti stanno rispondendo: con profondità alta, o se il server si sta svegliando, può servire fino a un minuto…',
}

const TYPE_MS = 35 // per carattere
const HOLD_MS = 2200 // pausa a frase completa
const HOLD_LONG_MS = 3800 // per i consigli e la frase sull'attesa, che vanno letti
const WAIT_AFTER_MS = 20000

function randomOther(lines, current) {
  let next = current
  while (next === current) next = lines[Math.floor(Math.random() * lines.length)]
  return next
}

// Box di dialogo "alla Pokémon" mostrato durante le attese lunghe (Zotero,
// ricerche): frasi a caso scritte lettera per lettera. Il lettore di schermo
// sente solo `label`.
export default function DialogLoader({ kind = 'enrich', label = 'Arricchimento in corso…' }) {
  const sets = SETS[kind]
  const waitLine = WAIT_LINES[kind] ?? WAIT_LINES.search
  // La frase più lunga del tipo, invisibile, fissa l'altezza: il box non cambia misura tra una frase e l'altra.
  const longest = [waitLine, ...sets.flat()].reduce((a, b) => (b.length > a.length ? b : a))
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [turn, setTurn] = useState(0)
  const [text, setText] = useState(() => randomOther(sets[0], null))
  const [shown, setShown] = useState(reduced ? Infinity : 0)

  // Una sola volta, dopo ~20 s, la frase onesta sull'attesa (subito, non a fine frase).
  useEffect(() => {
    const timer = setTimeout(() => {
      setText(waitLine)
      setShown(reduced ? Infinity : 0)
    }, WAIT_AFTER_MS)
    return () => clearTimeout(timer)
  }, [waitLine, reduced])

  const done = shown >= text.length
  const longHold = text === waitLine || (sets.length > 1 && turn % sets.length === 1)
  useEffect(() => {
    const timer = done
      ? setTimeout(
          () => {
            const next = turn + 1
            setTurn(next)
            setText((current) => randomOther(sets[next % sets.length], current))
            setShown(reduced ? Infinity : 0)
          },
          longHold ? HOLD_LONG_MS : HOLD_MS,
        )
      : setTimeout(() => setShown((n) => n + 1), TYPE_MS)
    return () => clearTimeout(timer)
  }, [done, shown, sets, reduced, turn, longHold])

  return (
    <div className="dialog-loader">
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      <p className="dialog-loader-text" aria-hidden="true">
        <span style={{ visibility: 'hidden' }}>{longest}</span>
        <span>{text.slice(0, shown)}</span>
      </p>
      {done && (
        <span className="dialog-loader-caret" aria-hidden="true">
          ▼
        </span>
      )}
    </div>
  )
}
