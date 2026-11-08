import { Link } from 'react-router-dom'

const STEPS = [
  { key: 'cerca', label: 'Ricerca', path: (id) => `/ricerche/${id}/cerca` },
  { key: 'duplicati', label: 'Duplicati', path: (id) => `/ricerche/${id}/sessione/duplicati` },
  { key: 'arricchisci', label: 'Arricchimento', path: (id) => `/ricerche/${id}/sessione/arricchisci` },
]

// Indicatore dei tre passaggi obbligatori del percorso guidato (voce 85):
// dove ci si trova adesso, cosa resta, e — per i passaggi già visitati —
// un modo rapido per tornarci, coerente con "avanti e indietro senza
// perdita di stato" già garantito dallo stato sollevato in ResearchLayout.
// I passaggi futuri non sono cliccabili: si sblocca solo avanzando con i
// bottoni "Continua" di ogni pagina, mai saltando dalla barra. Etichette
// rinominate a sostantivi coerenti tra loro (prima: Cerca/Duplicati/Zotero,
// un verbo + due nomi di cui uno un marchio di terzi).
export default function SessionStepper({ researchId, currentSegment }) {
  const currentIndex = STEPS.findIndex((step) => step.key === currentSegment)
  if (currentIndex === -1) return null

  return (
    <ol className="mb-6 flex items-start justify-center">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isPast = index < currentIndex

        const dotStyle = isCurrent
          ? { width: 36, height: 36, marginTop: -3, background: '#D4FF24', color: '#030407', boxShadow: '0 0 0 5px rgba(212,255,36,.14)' }
          : isPast
            ? { background: '#2B7CFF', color: '#030818' }
            : { background: '#0A0E16', border: '2px solid #1B2130', color: '#55606E' }

        const labelColor = isCurrent ? '#F3F4F6' : isPast ? '#9CC2FF' : '#55606E'

        const dot = (
          <div
            className="head flex items-center justify-center rounded-full font-extrabold"
            style={{ width: 30, height: 30, fontSize: 13, boxSizing: 'border-box', ...dotStyle }}
          >
            {isPast ? '✓' : index + 1}
          </div>
        )

        const content = (
          <div className="flex flex-col items-center gap-2" style={{ width: 120 }}>
            {dot}
            <div className="text-sm" style={{ color: labelColor, fontWeight: isCurrent ? 800 : 600 }}>
              {step.label}
            </div>
          </div>
        )

        return (
          <li key={step.key} className="flex items-start">
            {isPast ? <Link to={step.path(researchId)}>{content}</Link> : content}
            {index < STEPS.length - 1 && (
              <div
                style={{ width: 72, height: 3, marginTop: 17, borderRadius: 3, background: isPast ? '#2B7CFF' : '#1B2130' }}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
