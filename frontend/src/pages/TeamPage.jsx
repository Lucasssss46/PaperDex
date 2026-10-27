import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  inviteToRicerca,
  leaveRicerca,
  listRicercaInvites,
  listRicercaTeam,
  removeRicercaTeamMember,
} from '../api/ricerche'
import Field, { inputClass } from '../components/Field'
import TeamMemberItem from '../components/TeamMemberItem'

function InviteForm({ researchId, onInvited }) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim()) return

    setSending(true)
    setError('')
    setSent(false)
    try {
      await inviteToRicerca(researchId, email.trim())
      setEmail('')
      setSent(true)
      onInvited()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5"
    >
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Invita un collaboratore</h3>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collega@example.com"
              className={inputClass}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? 'Invio…' : 'Invita'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {sent && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Invito inviato.</p>}
    </form>
  )
}

function LeaveSection({ researchId, onLeft }) {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')

  async function handleLeave() {
    setLeaving(true)
    setError('')
    try {
      await leaveRicerca(researchId)
      onLeft()
    } catch (err) {
      setError(err.message)
      setLeaving(false)
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm dark:border-red-500/30 dark:bg-red-500/5">
      <h3 className="text-sm font-semibold text-red-900 dark:text-red-300">Abbandona la Ricerca</h3>
      <p className="mt-1 text-xs text-red-700/80 dark:text-red-400/80">
        Perderai l'accesso a questa Ricerca. Gli articoli e le query che hai contribuito a salvare restano condivisi con
        il resto del team.
      </p>
      <button
        type="button"
        onClick={handleLeave}
        disabled={leaving}
        className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
      >
        {leaving ? 'Uscita in corso…' : 'Lascia la Ricerca'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function inviteStatusLabel(state) {
  if (state === 'accepted') return 'Accettato'
  if (state === 'declined') return 'Rifiutato'
  return 'In attesa'
}

function inviteStatusClass(state) {
  if (state === 'accepted') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  if (state === 'declined') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
}

function SentInvites({ researchId, refreshKey }) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listRicercaInvites(researchId)
      .then((data) => setInvites(data.invites))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId, refreshKey])

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Inviti mandati</h3>
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Nessun invito mandato per ora.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span className="min-w-0 truncate text-sm text-neutral-700 dark:text-neutral-200">
                  {invite.receiver_email}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${inviteStatusClass(invite.state)}`}
                >
                  {inviteStatusLabel(invite.state)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function TeamPage() {
  const { researchId } = useOutletContext()
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invitesRefreshKey, setInvitesRefreshKey] = useState(0)

  useEffect(() => {
    listRicercaTeam(researchId)
      .then((data) => {
        setMembers(data.members)
        setIsOwner(data.is_owner)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId])

  if (loading) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  }

  async function handleRemoveMember(userId) {
    try {
      await removeRicercaTeamMember(researchId, userId)
      setMembers((current) => current.filter((m) => m.id !== userId))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="min-w-0">
        {isOwner ? (
          <InviteForm researchId={researchId} onInvited={() => setInvitesRefreshKey((k) => k + 1)} />
        ) : (
          <LeaveSection researchId={researchId} onLeft={() => navigate('/ricerche', { replace: true })} />
        )}
        <ul className="space-y-2">
          {members.map((member) => (
            <TeamMemberItem
              key={member.id}
              member={member}
              onRemove={isOwner ? handleRemoveMember : undefined}
            />
          ))}
        </ul>
      </div>

      {isOwner && (
        <div className="min-w-0">
          <SentInvites researchId={researchId} refreshKey={invitesRefreshKey} />
        </div>
      )}
    </div>
  )
}
