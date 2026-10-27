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
    <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{query.name}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{summarizeQuery(query)}</p>
      </div>
      <button
        type="button"
        onClick={onUse}
        className="shrink-0 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
      >
        Usa
      </button>
    </li>
  )
}
