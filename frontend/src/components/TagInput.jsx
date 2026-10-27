import { useState } from 'react'

export default function TagInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState('')

  function commitDraft() {
    const term = draft.trim()
    if (term && !value.includes(term)) {
      onChange([...value, term])
    }
    setDraft('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  function removeTag(index) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="@container flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-800">
      {value.map((tag, index) => (
        <span
          key={tag + index}
          className="flex max-w-full items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
        >
          <span className="min-w-0 break-words">{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(index)}
            className="text-violet-500 hover:text-violet-800 dark:hover:text-violet-100"
            aria-label={`Rimuovi ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : ''}
        className="min-w-24 flex-1 border-none bg-transparent py-1 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100 @max-[140px]:placeholder:text-transparent"
      />
    </div>
  )
}
