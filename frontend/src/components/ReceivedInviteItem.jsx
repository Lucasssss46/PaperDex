import { Link } from 'react-router-dom'

function statusLabel(state) {
  if (state === 'accepted') return 'Accettato'
  if (state === 'declined') return 'Rifiutato'
  return 'In attesa'
}

function statusStyle(state) {
  if (state === 'accepted') return { background: 'color-mix(in srgb, var(--color-ok-base) 15%, transparent)', color: 'var(--color-ok)' }
  if (state === 'declined') return { background: 'color-mix(in srgb, var(--color-err-base) 15%, transparent)', color: 'var(--color-err)' }
  return { background: 'color-mix(in srgb, var(--color-warn-base) 15%, transparent)', color: 'var(--color-warn)' }
}

export default function ReceivedInviteItem({ invite }) {
  return (
    <li className="row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--color-ink-1)' }}>
          {invite.research_name}
        </p>
        <p className="truncate text-xs" style={{ color: 'var(--color-ink-4)' }}>
          da {invite.sender_name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={statusStyle(invite.state)}>
          {statusLabel(invite.state)}
        </span>
        {invite.state === 'pending' && invite.token && (
          <Link to={`/inviti/accetta?token=${invite.token}`} className="action-link">
            Rispondi
          </Link>
        )}
      </div>
    </li>
  )
}
