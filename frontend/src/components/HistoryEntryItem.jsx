function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HistoryEntryItem({ entry }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="truncate text-sm text-neutral-900 dark:text-neutral-50">
        <span className="font-medium">{entry.added_by}</span> ha aggiunto{' '}
        <span className="font-medium">{entry.article_title ?? 'un articolo'}</span>
      </p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{formatTimestamp(entry.added_at)}</p>
    </li>
  )
}
