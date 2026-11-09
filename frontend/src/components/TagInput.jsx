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
    <div
      className="@container flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5"
      style={{ background: '#0A0E16', border: '1.5px solid #1B2130' }}
    >
      {value.map((tag, index) => (
        <span
          key={tag + index}
          className="flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: 'rgba(43,124,255,.2)', color: '#9CC2FF' }}
        >
          <span className="min-w-0 break-words">{tag}</span>
          <button type="button" onClick={() => removeTag(index)} aria-label={`Rimuovi ${tag}`}>
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
        className="min-w-24 flex-1 border-none bg-transparent py-1 text-sm outline-none placeholder:text-[#55606E] @max-[140px]:placeholder:text-transparent"
        style={{ color: '#F3F4F6' }}
      />
    </div>
  )
}
