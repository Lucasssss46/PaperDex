import { useState } from 'react'
import Field, { inputClass } from './Field'
import TagInput from './TagInput'

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
        className="w-full"
        style={{ accentColor: '#2B7CFF' }}
      />
      <div className="mt-1 flex justify-between text-xs" style={{ color: '#55606E' }}>
        {DEPTH_STEPS.map((step) => (
          <span key={step} style={step === value ? { fontWeight: 600, color: '#9CC2FF' } : undefined}>
            {DEPTH_LABELS[step].title}
          </span>
        ))}
      </div>
      <p className="mt-1 text-center text-xs" style={{ color: '#8B93A5' }}>
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
    <form id="search-form" onSubmit={handleSubmit} className="card min-w-0" style={{ padding: 0, flex: '1 1 0' }}>
      <div className="ribbon-flat">Autori e profondità</div>
      <div className="flex flex-col gap-4" style={{ padding: '14px 16px' }}>
        <Field label="Autori">
          <TagInput value={authors} onChange={onAuthorsChange} placeholder="es. Hinton, LeCun…" />
        </Field>

        <div>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="action-link">
            {showAdvanced ? '− Nascondi filtri avanzati' : '+ Filtri avanzati (venue, anno, esclusioni)'}
          </button>

          {showAdvanced && (
            <div className="mt-4 flex flex-col gap-4 border-t pt-4" style={{ borderColor: '#1B2130' }}>
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
            <span className="block text-sm font-medium" style={{ color: '#C3C9D4' }}>
              Profondità di ricerca
            </span>
            <div className="group relative">
              <button
                type="button"
                aria-label="Informazioni sulla profondità di ricerca"
                className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold leading-none"
                style={{ border: '1px solid #55606E', color: '#8B93A5' }}
              >
                i
              </button>

              <div
                className="card pointer-events-none absolute left-0 top-full z-20 mt-2 w-64 p-3 text-xs opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                style={{ color: '#8B93A5' }}
              >
                <p className="mb-1.5">Per ogni sorgente, ciascun livello restituisce:</p>
                <ul className="space-y-0.5">
                  <li>
                    <strong>Bassa</strong>: fino a 15 articoli
                  </li>
                  <li>
                    <strong>Media</strong>: fino a 50 articoli
                  </li>
                  <li>
                    <strong>Alta</strong>: fino a 150 articoli
                  </li>
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
