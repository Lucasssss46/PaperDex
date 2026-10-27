export default function TeamMemberItem({ member, onRemove }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{member.name}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{member.email}</p>
      </div>
      {member.is_owner ? (
        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
          Proprietario
        </span>
      ) : (
        onRemove && (
          <button
            type="button"
            onClick={() => onRemove(member.id)}
            className="shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Rimuovi
          </button>
        )
      )}
    </li>
  )
}
