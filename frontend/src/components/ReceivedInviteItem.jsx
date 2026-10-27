import { Link } from 'react-router-dom'

function statusLabel(state) {
  if (state === 'accepted') return 'Accettato'
  if (state === 'declined') return 'Rifiutato'
  return 'In attesa'
}

function statusClass(state) {
  if (state === 'accepted') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  if (state === 'declined') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
}

export default function ReceivedInviteItem({ invite }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-50">{invite.project_name}</p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">da {invite.sender_name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(invite.state)}`}>
          {statusLabel(invite.state)}
        </span>
        {invite.state === 'pending' && invite.token && (
          <Link
            to={`/inviti/accetta?token=${invite.token}`}
            className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
          >
            Rispondi
          </Link>
        )}
      </div>
    </li>
  )
}
