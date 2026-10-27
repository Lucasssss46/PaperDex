import { Link } from 'react-router-dom'

const STEPS = [
  { key: 'cerca', label: 'Cerca', path: (id) => `/ricerche/${id}/cerca` },
  { key: 'duplicati', label: 'Duplicati', path: (id) => `/ricerche/${id}/sessione/duplicati` },
  { key: 'arricchisci', label: 'Zotero', path: (id) => `/ricerche/${id}/sessione/arricchisci` },
]

// Indicatore dei tre passaggi obbligatori del percorso guidato (voce 85):
// dove ci si trova adesso, cosa resta, e — per i passaggi già visitati —
// un modo rapido per tornarci, coerente con "avanti e indietro senza
// perdita di stato" già garantito dallo stato sollevato in ResearchLayout.
// I passaggi futuri non sono cliccabili: si sblocca solo avanzando con i
// bottoni "Continua" di ogni pagina, mai saltando dalla barra.
export default function SessionStepper({ researchId, currentSegment }) {
  const currentIndex = STEPS.findIndex((step) => step.key === currentSegment)
  if (currentIndex === -1) return null

  return (
    <ol className="mb-6 flex items-center justify-center">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex
        const isPast = index < currentIndex

        const circleClass = isCurrent
          ? 'border-violet-600 bg-violet-600 text-white'
          : isPast
            ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/50 dark:bg-violet-500/20 dark:text-violet-300'
            : 'border-neutral-300 bg-white text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-600'

        const labelClass = isCurrent
          ? 'font-semibold text-violet-700 dark:text-violet-300'
          : isPast
            ? 'font-medium text-neutral-600 dark:text-neutral-300'
            : 'text-neutral-400 dark:text-neutral-600'

        const content = (
          <span className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${circleClass}`}
            >
              {index + 1}
            </span>
            <span className={`text-sm ${labelClass}`}>{step.label}</span>
          </span>
        )

        return (
          <li key={step.key} className="flex items-center">
            {isPast ? (
              <Link to={step.path(researchId)} className="hover:opacity-80">
                {content}
              </Link>
            ) : (
              content
            )}
            {index < STEPS.length - 1 && (
              <span
                className={`mx-3 h-px w-8 sm:w-12 ${
                  isPast ? 'bg-violet-300 dark:bg-violet-500/50' : 'bg-neutral-200 dark:bg-neutral-800'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
