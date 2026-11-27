export default function TeamMemberItem({ member, onRemove }) {
  return (
    <li className="row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-1">{member.name}</p>
        <p className="truncate text-xs text-ink-4">{member.email}</p>
      </div>
      {member.is_owner ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'color-mix(in srgb, var(--color-lime) 12%, transparent)', color: 'var(--color-lime)' }}>
          Proprietario
        </span>
      ) : (
        onRemove && (
          <button type="button" onClick={() => onRemove(member.id)} className="action-link danger shrink-0">
            Rimuovi
          </button>
        )
      )}
    </li>
  )
}
