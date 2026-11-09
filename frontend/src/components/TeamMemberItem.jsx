export default function TeamMemberItem({ member, onRemove }) {
  return (
    <li className="row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#F3F4F6]">{member.name}</p>
        <p className="truncate text-xs text-[#8B93A5]">{member.email}</p>
      </div>
      {member.is_owner ? (
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'rgba(212,255,36,.12)', color: '#D4FF24' }}>
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
