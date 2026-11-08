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
    <li className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
      <p className="truncate text-sm text-[#F3F4F6]" title={`${entry.added_by} ha aggiunto ${entry.article_title ?? 'un articolo'}`}>
        <span className="font-medium">{entry.added_by}</span> ha aggiunto{' '}
        <span className="font-medium">{entry.article_title ?? 'un articolo'}</span>
      </p>
      <p className="text-xs text-[#55606E]">{formatTimestamp(entry.added_at)}</p>
    </li>
  )
}
