function summarizeQuery(query) {
  const parts = []
  if (query.keyword_include?.length) {
    parts.push(query.keyword_include.map((group) => group.join('/')).join(' + '))
  }
  if (query.author?.length) parts.push(`autori: ${query.author.join(', ')}`)
  if (query.journal?.length) parts.push(`venue: ${query.journal.join(', ')}`)
  if (query.year_start || query.year_end) {
    parts.push(`anni: ${query.year_start ?? '…'}–${query.year_end ?? '…'}`)
  }
  return parts.length ? parts.join(' · ') : 'Nessun criterio specifico'
}

export default function QueryListItem({ query, onUse }) {
  return (
    <li className="row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#F3F4F6]" title={query.name}>
          {query.name}
        </p>
        <p className="truncate text-xs text-[#8B93A5]" title={summarizeQuery(query)}>
          {summarizeQuery(query)}
        </p>
      </div>
      {onUse && (
        <button type="button" onClick={onUse} className="action-link shrink-0" title="Usa questa query">
          Usa
        </button>
      )}
    </li>
  )
}
