import { useState } from 'react'
import { expandKeywords } from '../api/keywords'
import TagInput from './TagInput'
import Field from './Field'

export default function KeywordsPanel({ groups, onUpdateGroup, onAddGroup, onAddGroups, onRemoveGroup }) {
  const [expandingIndex, setExpandingIndex] = useState(null)
  const [expandError, setExpandError] = useState('')

  async function handleExpand(index) {
    const terms = groups[index].filter(Boolean)
    if (terms.length === 0) return

    setExpandingIndex(index)
    setExpandError('')
    try {
      const { suggestions } = await expandKeywords(terms)
      // Ogni suggerimento è un'alternativa (sinonimo/acronimo) a uno dei
      // termini di partenza, non un requisito aggiuntivo da richiedere
      // insieme ad essi: va in una nuova sezione OR tutta sua, non dentro
      // il gruppo esistente (che è in AND al suo interno).
      const existing = new Set(groups.flat().map((t) => t.toLowerCase()))
      const newGroups = suggestions
        .filter((s) => !existing.has(s.toLowerCase()))
        .map((s) => [s])
      if (newGroups.length > 0) {
        onAddGroups(newGroups)
      }
    } catch (err) {
      setExpandError(err.message)
    } finally {
      setExpandingIndex(null)
    }
  }

  return (
    <aside className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <h2 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Keyword</h2>

      <div className="mt-4 space-y-4">
        {groups.map((group, index) => (
          <Field key={index} label={index === 0 ? 'Termini' : `Alternativa ${index} (OR)`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <TagInput
                  value={group}
                  onChange={(terms) => onUpdateGroup(index, terms)}
                  placeholder={index === 0 ? 'es. transformer…' : 'termini alternativi…'}
                />
              </div>
              <button
                type="button"
                onClick={() => handleExpand(index)}
                disabled={expandingIndex === index || group.filter(Boolean).length === 0}
                title="Suggerisci acronimi e sinonimi"
                className="mt-2 shrink-0 text-sm text-violet-500 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-violet-400 dark:hover:text-violet-300"
              >
                {expandingIndex === index ? '…' : '✨'}
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onRemoveGroup(index)}
                  className="mt-2 text-sm text-neutral-400 hover:text-red-500"
                  aria-label="Rimuovi alternativa"
                >
                  ×
                </button>
              )}
            </div>
          </Field>
        ))}

        {expandError && <p className="text-xs text-red-600 dark:text-red-400">{expandError}</p>}

        <button
          type="button"
          onClick={onAddGroup}
          className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
        >
          + Aggiungi alternativa (OR)
        </button>
      </div>
    </aside>
  )
}
