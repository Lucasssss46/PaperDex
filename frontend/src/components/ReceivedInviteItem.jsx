import { Link } from 'react-router-dom'

function statusLabel(state) {
  if (state === 'accepted') return 'Accettato'
  if (state === 'declined') return 'Rifiutato'
  return 'In attesa'
}

function statusStyle(state) {
  if (state === 'accepted') return { background: 'rgba(16,185,129,.15)', color: '#6EE7B7' }
  if (state === 'declined') return { background: 'rgba(248,113,113,.15)', color: '#FCA5A5' }
  return { background: 'rgba(217,119,6,.15)', color: '#FCD34D' }
}

export default function ReceivedInviteItem({ invite }) {
  return (
    <li className="row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: '#F3F4F6' }}>
          {invite.project_name}
        </p>
        <p className="truncate text-xs" style={{ color: '#8B93A5' }}>
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
