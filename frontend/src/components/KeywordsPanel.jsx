import { useState } from 'react'
import { expandKeywords } from '../api/keywords'
import Field from './Field'
import TagInput from './TagInput'

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
      const newGroups = suggestions.filter((s) => !existing.has(s.toLowerCase())).map((s) => [s])
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
    <aside className="card min-w-0" style={{ padding: 0, flex: '1 1 0' }}>
      <div className="ribbon-flat">Keyword</div>
      <div className="flex flex-col gap-4" style={{ padding: '14px 16px' }}>
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
                className="mt-2 shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: '#9CC2FF' }}
              >
                {expandingIndex === index ? '…' : '✨'}
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onRemoveGroup(index)}
                  className="mt-2 text-sm"
                  style={{ color: '#55606E' }}
                  aria-label="Rimuovi alternativa"
                >
                  ×
                </button>
              )}
            </div>
          </Field>
        ))}

        {expandError && (
          <p className="text-xs" style={{ color: '#FCA5A5' }}>
            {expandError}
          </p>
        )}

        <button type="button" onClick={onAddGroup} className="action-link text-left">
          + Aggiungi alternativa (OR)
        </button>
      </div>
    </aside>
  )
}
