import { useState } from 'react'
import TagInput from './TagInput'
import Field, { inputClass } from './Field'

const DEPTH_STEPS = ['bassa', 'media', 'alta']
const DEPTH_LABELS = {
  bassa: { title: 'Bassa', hint: 'Veloce' },
  media: { title: 'Media', hint: 'Bilanciata' },
  alta: { title: 'Alta', hint: 'Approfondita' },
}

function DepthSlider({ value, onChange }) {
  const index = DEPTH_STEPS.indexOf(value)

  return (
    <div>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={index}
        onChange={(e) => onChange(DEPTH_STEPS[Number(e.target.value)])}
        className="w-full accent-violet-600"
      />
      <div className="mt-1 flex justify-between text-xs text-neutral-400 dark:text-neutral-500">
        {DEPTH_STEPS.map((step) => (
          <span
            key={step}
            className={step === value ? 'font-semibold text-violet-600 dark:text-violet-400' : ''}
          >
            {DEPTH_LABELS[step].title}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
        {DEPTH_LABELS[value].hint}
      </p>
    </div>
  )
}

export default function SearchForm({
  authors,
  onAuthorsChange,
  excludeTerms,
  onExcludeTermsChange,
  journals,
  onJournalsChange,
  yearStart,
  onYearStartChange,
  yearEnd,
  onYearEndChange,
  depth,
  onDepthChange,
  onSubmit,
}) {
  // Sola preferenza di visualizzazione, non un valore della query: non serve
  // sollevarla al genitore insieme al resto.
  const [showAdvanced, setShowAdvanced] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
    onSubmit({
      keywordExclude: excludeTerms,
      author: authors,
      journal: journals,
      yearStart: yearStart ? Number(yearStart) : null,
      yearEnd: yearEnd ? Number(yearEnd) : null,
      depth,
    })
  }

  return (
    <form
      id="search-form"
      onSubmit={handleSubmit}
      className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5"
    >
      <h2 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Autori e profondità</h2>

      <div className="mt-4 space-y-4">
        <Field label="Autori">
          <TagInput value={authors} onChange={onAuthorsChange} placeholder="es. Hinton, LeCun…" />
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            {showAdvanced ? '− Nascondi filtri avanzati' : '+ Filtri avanzati (venue, anno, esclusioni)'}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 border-t border-violet-200/60 pt-4 dark:border-violet-500/20">
              <Field label="Venue / Journal">
                <TagInput value={journals} onChange={onJournalsChange} placeholder="es. NeurIPS, IEEE…" />
              </Field>

              <Field label="Escludi keyword">
                <TagInput value={excludeTerms} onChange={onExcludeTermsChange} placeholder="termini da escludere…" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Anno da">
                  <input
                    type="number"
                    value={yearStart}
                    onChange={(e) => onYearStartChange(e.target.value)}
                    placeholder="2020"
                    className={inputClass}
                  />
                </Field>
                <Field label="Anno a">
                  <input
                    type="number"
                    value={yearEnd}
                    onChange={(e) => onYearEndChange(e.target.value)}
                    placeholder="2026"
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <span className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Profondità di ricerca
            </span>
            <div className="group relative">
              <button
                type="button"
                aria-label="Informazioni sulla profondità di ricerca"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-neutral-400 text-[10px] font-semibold leading-none text-neutral-500 hover:border-violet-500 hover:text-violet-600 dark:border-neutral-500 dark:text-neutral-400 dark:hover:border-violet-400 dark:hover:text-violet-400"
              >
                i
              </button>

              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 rounded-lg border border-violet-200 bg-white p-3 text-xs text-neutral-600 opacity-0 shadow-lg transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 dark:border-violet-500/30 dark:bg-neutral-800 dark:text-neutral-300">
                <p className="mb-1.5">Per ogni sorgente, ciascun livello restituisce:</p>
                <ul className="space-y-0.5">
                  <li><strong>Bassa</strong>: fino a 15 articoli</li>
                  <li><strong>Media</strong>: fino a 50 articoli</li>
                  <li><strong>Alta</strong>: fino a 150 articoli</li>
                </ul>
              </div>
            </div>
          </div>

          <DepthSlider value={depth} onChange={onDepthChange} />
        </div>
      </div>
    </form>
  )
}
