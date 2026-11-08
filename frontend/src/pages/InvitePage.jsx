import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { login, register } from '../api/auth'
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
  const [acceptedProjectId, setAcceptedProjectId] = useState(null)

  // Solo per lo scenario "destinatario non ancora registrato".
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')

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
      setAcceptedProjectId(data.project_id)
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
              <Link to={`/ricerche/${acceptedProjectId}/overview`} className="action-link">
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
                <strong>{invite.sender_name}</strong> ti ha invitato a partecipare a <strong>{invite.project_name}</strong>.
                {invite.project_description && (
                  <p className="mt-1" style={{ color: '#9CC2FF' }}>
                    {invite.project_description}
                  </p>
                )}
              </div>

              {actionError && (
                <p className="notice-err mt-4">{actionError}</p>
              )}

              {invite.user_exists ? (
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
