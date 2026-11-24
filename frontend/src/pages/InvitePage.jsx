import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getCurrentUser, login, register } from '../api/auth'
import { TOKEN_KEY } from '../api/client'
import { acceptInvite, declineInvite, getInvite } from '../api/inviti'
import Field, { inputClass } from '../components/Field'
import Logo, { Wordmark } from '../components/Logo'
import PasswordInput from '../components/PasswordInput'

export default function InvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(token))
  const [error, setError] = useState(() => (token ? '' : 'Link non valido: manca il token di invito.'))

  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [outcome, setOutcome] = useState(null) // null | 'accepted' | 'declined'
  const [acceptedResearchId, setAcceptedResearchId] = useState(null)

  // Solo per lo scenario "destinatario non ancora registrato".
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')

  // Email dell'account già collegato in questo browser, se c'è: la pagina è
  // pubblica, ma chi apre il link potrebbe essere entrato con un altro account.
  const [loggedInEmails, setLoggedInEmails] = useState(null)

  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return
    getCurrentUser()
      .then((user) =>
        setLoggedInEmails(
          [user.email, ...(user.additional_emails ?? [])].filter(Boolean).map((e) => e.toLowerCase()),
        ),
      )
      .catch(() => {})
  }, [])

  function handleLogoutHere() {
    // Reload completo: App.jsx legge il token da localStorage solo all'avvio.
    localStorage.removeItem(TOKEN_KEY)
    window.location.reload()
  }

  useEffect(() => {
    if (!token) return
    getInvite(token)
      .then(setInvite)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleAccept() {
    setActionLoading(true)
    setActionError('')
    try {
      const data = await acceptInvite(token)
      setAcceptedResearchId(data.research_id)
      setOutcome('accepted')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDecline() {
    setActionLoading(true)
    setActionError('')
    try {
      await declineInvite(token)
      setOutcome('declined')
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault()
    setActionLoading(true)
    setActionError('')
    try {
      // Il backend forza comunque l'email a quella dell'invito: la passiamo
      // qui solo per coerenza (il campo nel form è disabilitato).
      await register(firstName, lastName, invite.receiver_email, password, token)
      const data = await login(invite.receiver_email, password)
      localStorage.setItem(TOKEN_KEY, data.access_token)
      // Reload completo (non navigate): App.jsx legge il token da
      // localStorage solo all'inizializzazione, così riparte già autenticato
      // e con la ricerca invitata già tra le partecipazioni.
      window.location.href = '/ricerche'
    } catch (err) {
      setActionError(err.message)
      setActionLoading(false)
    }
  }

  const wrongAccount = Boolean(
    invite && loggedInEmails && !loggedInEmails.includes(invite.receiver_email.toLowerCase()),
  )

  return (
    <div className="auth-page">
      <div className="card w-full max-w-sm" style={{ padding: '34px 32px 30px' }}>
        <div className="flex flex-col items-center gap-2.5">
          <Logo size={44} />
          <Wordmark size={21} />
          <div className="text-sm" style={{ color: '#8B93A5' }}>
            Invito a collaborare
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <p className="text-center text-sm" style={{ color: '#8B93A5' }}>
              Caricamento…
            </p>
          ) : error ? (
            <p className="notice-err">{error}</p>
          ) : outcome === 'accepted' ? (
            <div className="flex flex-col items-center gap-3.5 text-center">
              <p className="notice-ok">Invito accettato! Accedi al tuo account per vedere la ricerca.</p>
              <Link to={`/ricerche/${acceptedResearchId}/overview`} className="action-link">
                Vai alla ricerca
              </Link>
            </div>
          ) : outcome === 'declined' ? (
            <p className="text-center text-sm" style={{ color: '#8B93A5' }}>
              Hai rifiutato l'invito.
            </p>
          ) : invite.state !== 'pending' ? (
            <p className="text-center text-sm" style={{ color: '#8B93A5' }}>
              Questo invito è già stato {invite.state === 'accepted' ? 'accettato' : 'rifiutato'}.
            </p>
          ) : (
            <>
              <div className="invite-box">
                <strong>{invite.sender_name}</strong> ti ha invitato a partecipare a <strong>{invite.research_name}</strong>.
                {invite.research_description && (
                  <p className="mt-1" style={{ color: '#9CC2FF' }}>
                    {invite.research_description}
                  </p>
                )}
              </div>

              {wrongAccount && (
                <div className="notice-warn mt-4">
                  <p>
                    In questo browser sei collegato con un altro account, ma l'invito è per{' '}
                    <strong>{invite.receiver_email}</strong>.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button type="button" onClick={handleLogoutHere} className="pill-btn w-full" style={{ padding: '10px 0' }}>
                      Cambia account
                    </button>
                    <Link to="/ricerche" className="action-link" style={{ textAlign: 'center' }}>
                      Resta con il tuo account
                    </Link>
                  </div>
                </div>
              )}

              {actionError && (
                <p className="notice-err mt-4">{actionError}</p>
              )}

              {/* Con un altro account collegato si sceglie prima cosa fare:
                  accettare da qui finirebbe nella sessione sbagliata. */}
              {wrongAccount ? null : invite.user_exists ? (
                <div className="mt-4 flex gap-2.5">
                  <button type="button" onClick={handleAccept} disabled={actionLoading} className="pill-btn flex-1" style={{ padding: '10px 0' }}>
                    Accetta
                  </button>
                  <button type="button" onClick={handleDecline} disabled={actionLoading} className="ghost-btn-lg" style={{ flex: 1, padding: '10px 0' }}>
                    Rifiuta
                  </button>
                </div>
              ) : (
                <>
                  <p className="notice-warn mt-4">
                    Non hai ancora un account su PapérDex. Per accettare, crealo con l'indirizzo a cui hai ricevuto
                    l'invito — non è possibile usarne uno diverso.
                  </p>

                  <form onSubmit={handleRegisterSubmit} className="mt-4 flex flex-col gap-3.5">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Nome">
                        <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" className={inputClass} />
                      </Field>
                      <Field label="Cognome">
                        <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" className={inputClass} />
                      </Field>
                    </div>
                    <Field label="Email" hint="Bloccata sull'indirizzo a cui è stato mandato l'invito.">
                      <input type="email" value={invite.receiver_email} disabled className={`${inputClass} cursor-not-allowed opacity-70`} />
                    </Field>
                    <Field label="Password">
                      <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    </Field>

                    <button type="submit" disabled={actionLoading} className="pill-btn w-full" style={{ padding: '11px 0', marginTop: 4 }}>
                      {actionLoading ? 'Creazione account…' : 'Crea account e accetta'}
                    </button>

                    <button type="button" onClick={handleDecline} disabled={actionLoading} className="action-link" style={{ textAlign: 'center' }}>
                      Rifiuta l'invito
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
