import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { inviteToRicerca, leaveRicerca, listRicercaInvites, listRicercaTeam, removeRicercaTeamMember } from '../api/ricerche'
import { inputClass } from '../components/Field'
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
    <form onSubmit={handleSubmit} className="row" style={{ paddingTop: 0, alignItems: 'flex-end' }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@esempio.it"
        className={inputClass}
        style={{ flex: 1 }}
      />
      <button type="submit" disabled={sending || !email.trim()} className="pill-btn">
        {sending ? 'Invio…' : 'Invita'}
      </button>
      {error && (
        <p className="text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
      {sent && (
        <p className="text-sm" style={{ color: '#6EE7B7' }}>
          Invito inviato.
        </p>
      )}
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
    <div className="mb-6 rounded-2xl p-5" style={{ border: '1px solid rgba(248,113,113,.3)', background: 'rgba(248,113,113,.06)' }}>
      <h3 className="text-sm font-semibold" style={{ color: '#FCA5A5' }}>
        Abbandona la Ricerca
      </h3>
      <p className="mt-1 text-xs" style={{ color: 'rgba(252,165,165,.8)' }}>
        Perderai l'accesso a questa Ricerca. Gli articoli e le query che hai contribuito a salvare restano condivisi con
        il resto del team.
      </p>
      <button type="button" onClick={handleLeave} disabled={leaving} className="ghost-btn mt-3" style={{ color: '#FCA5A5', borderColor: 'rgba(248,113,113,.4)' }}>
        {leaving ? 'Uscita in corso…' : 'Lascia la Ricerca'}
      </button>
      {error && (
        <p className="mt-2 text-xs" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
    </div>
  )
}

function inviteStatusStyle(state) {
  if (state === 'accepted') return { background: 'rgba(16,185,129,.15)', color: '#6EE7B7' }
  if (state === 'declined') return { background: 'rgba(248,113,113,.15)', color: '#FCA5A5' }
  return { background: 'rgba(217,119,6,.15)', color: '#FCD34D' }
}

function inviteStatusLabel(state) {
  if (state === 'accepted') return 'Accettato'
  if (state === 'declined') return 'Rifiutato'
  return 'In attesa'
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
    <section className="card" style={{ padding: 0 }}>
      <div className="ribbon-flat muted">Inviti mandati</div>
      <div style={{ padding: '10px 16px 14px' }}>
        {loading ? (
          <p className="text-sm" style={{ color: '#8B93A5' }}>
            Caricamento…
          </p>
        ) : error ? (
          <p className="text-sm" style={{ color: '#FCA5A5' }}>
            {error}
          </p>
        ) : invites.length === 0 ? (
          <p className="text-sm" style={{ color: '#8B93A5' }}>
            Nessun invito mandato per ora.
          </p>
        ) : (
          invites.map((invite) => (
            <div key={invite.id} className="row">
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: '#C3C9D4' }}>
                {invite.receiver_email}
              </span>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={inviteStatusStyle(invite.state)}>
                {inviteStatusLabel(invite.state)}
              </span>
            </div>
          ))
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
    return (
      <p className="text-sm" style={{ color: '#8B93A5' }}>
        Caricamento…
      </p>
    )
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: '#FCA5A5' }}>
        {error}
      </p>
    )
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
        <ul>
          {members.map((member) => (
            <TeamMemberItem key={member.id} member={member} onRemove={isOwner ? handleRemoveMember : undefined} />
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
