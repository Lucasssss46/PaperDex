// Riga "autori • anno" delle righe della ruota: sempre una sola riga; se è
// troppo lunga si tronca con i puntini solo la parte degli autori, e
// " • anno" resta sempre visibile (tutto il resto è nella card espansa).
export default function AuthorsYear({ authors, date }) {
  const names = authors?.join(', ')
  const year = date ? String(date).slice(0, 4) : null

  return (
    <div style={{ display: 'flex', fontSize: 12, color: '#8B93A5', whiteSpace: 'nowrap', minWidth: 0 }}>
      {names && (
        <span title={names} style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {names}
        </span>
      )}
      {year && (
        <span style={{ flex: '0 0 auto' }}>
          {/* spazi non separabili: in un flex item gli spazi iniziali verrebbero eliminati */}
          {names ? ' • ' : ''}
          <span style={{ color: '#D4FF24' }}>{year}</span>
        </span>
      )}
    </div>
  )
}
