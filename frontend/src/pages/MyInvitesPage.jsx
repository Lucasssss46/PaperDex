import { useEffect, useState } from 'react'
import { getMyInvites } from '../api/profile'
import BackLink from '../components/BackLink'
import ReceivedInviteItem from '../components/ReceivedInviteItem'

export default function MyInvitesPage() {
  const [invites, setInvites] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMyInvites()
      .then((data) => setInvites(data.invites))
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Inviti ricevuti</h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Gli inviti a partecipare a una Ricerca che altri utenti ti hanno mandato.
          </p>
        </div>
        <BackLink to="/profilo" label="Profilo" />
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!invites ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
      ) : invites.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Nessun invito ricevuto per ora.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {invites.map((invite) => (
            <ReceivedInviteItem key={invite.id} invite={invite} />
          ))}
        </ul>
      )}
    </div>
  )
}
