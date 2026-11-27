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
          ? { width: 36, height: 36, marginTop: -3, background: 'var(--color-lime)', color: 'var(--color-bg)', boxShadow: '0 0 0 5px color-mix(in srgb, var(--color-lime) 14%, transparent)' }
          : isPast
            ? { background: 'var(--color-blue)', color: 'var(--color-bg)' }
            : { background: 'var(--color-field)', border: '2px solid var(--color-border)', color: 'var(--color-ink-5)' }

        const labelColor = isCurrent ? 'var(--color-ink-1)' : isPast ? 'var(--color-ink-3)' : 'var(--color-ink-5)'

        const dot = (
          <div
            className="head flex items-center justify-center rounded-full font-extrabold"
            style={{ width: 30, height: 30, fontSize: 13, boxSizing: 'border-box', ...dotStyle }}
          >
            {isPast ? '✓' : index + 1}
          </div>
        )

        const content = (
          <div className="flex w-[84px] flex-col items-center gap-2 sm:w-[120px]">
            {dot}
            <div className="text-xs sm:text-sm" style={{ color: labelColor, fontWeight: isCurrent ? 800 : 600 }}>
              {step.label}
            </div>
          </div>
        )

        return (
          <li key={step.key} className="flex items-start">
            {isPast ? <Link to={step.path(researchId)}>{content}</Link> : content}
            {index < STEPS.length - 1 && (
              <div
                className="w-5 sm:w-[72px]"
                style={{ height: 3, marginTop: 17, borderRadius: 3, background: isPast ? 'var(--color-blue)' : 'var(--color-border)' }}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
