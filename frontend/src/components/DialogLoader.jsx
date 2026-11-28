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
  'Cerco nuove versioni nell\'erba alta…',
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
const WAIT_LINE = 'Il server di Zotero si sta svegliando: può servire fino a un minuto…'

const TYPE_MS = 35 // per carattere
const HOLD_MS = 2200 // pausa a frase completa
const WAIT_AFTER_MS = 20000

function randomOther(lines, current) {
  let next = current
  while (next === current) next = lines[Math.floor(Math.random() * lines.length)]
  return next
}

// Box di dialogo "alla Pokémon" mostrato mentre Zotero lavora: frasi a caso
// scritte lettera per lettera. Il lettore di schermo sente solo `label`.
export default function DialogLoader({ kind = 'enrich', label = 'Arricchimento in corso…' }) {
  const lines = kind === 'update' ? UPDATE_LINES : ENRICH_LINES
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [text, setText] = useState(() => randomOther(lines, null))
  const [shown, setShown] = useState(reduced ? Infinity : 0)
  const [waitDue, setWaitDue] = useState(false)
  const [waitShown, setWaitShown] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setWaitDue(true), WAIT_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  const done = shown >= text.length
  useEffect(() => {
    const timer = done
      ? setTimeout(() => {
          // Una sola volta, dopo ~20 s, la frase onesta sull'attesa.
          if (waitDue && !waitShown) {
            setWaitShown(true)
            setText(WAIT_LINE)
          } else {
            setText((current) => randomOther(lines, current))
          }
          setShown(reduced ? Infinity : 0)
        }, HOLD_MS)
      : setTimeout(() => setShown((n) => n + 1), TYPE_MS)
    return () => clearTimeout(timer)
  }, [done, shown, lines, reduced, waitDue, waitShown])

  return (
    <div className="dialog-loader">
      <span role="status" aria-live="polite" className="sr-only">
        {label}
      </span>
      {/* La frase intera, invisibile, riserva l'altezza: il box non cresce mentre si scrive. */}
      <p className="dialog-loader-text" aria-hidden="true">
        <span style={{ visibility: 'hidden' }}>{text}</span>
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
