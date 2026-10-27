import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { login, register } from '../api/auth'
import { TOKEN_KEY } from '../api/client'
import { acceptInvite, declineInvite, getInvite } from '../api/inviti'
import Field, { inputClass } from '../components/Field'
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
    <div className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-neutral-900/5 dark:border-neutral-800 dark:bg-neutral-900">
        <h1
          className="text-center text-3xl tracking-wide text-white"
          style={{
            fontFamily: '"Luckiest Guy", cursive',
            WebkitTextStroke: '1.5px #7c3aed',
            textShadow: '2px 2px 0 rgba(0,0,0,0.3)',
          }}
        >
          PapérDex
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">Invito a collaborare</p>

        <div className="mt-6">
          {loading ? (
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
          ) : error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          ) : outcome === 'accepted' ? (
            <div className="space-y-4 text-center">
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Invito accettato! Accedi al tuo account per vedere la ricerca.
              </p>
              <Link
                to={`/ricerche/${acceptedProjectId}/overview`}
                className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
              >
                Vai alla ricerca
              </Link>
            </div>
          ) : outcome === 'declined' ? (
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">Hai rifiutato l'invito.</p>
          ) : invite.state !== 'pending' ? (
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              Questo invito è già stato {invite.state === 'accepted' ? 'accettato' : 'rifiutato'}.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 text-sm dark:border-violet-500/30 dark:bg-violet-500/5">
                <p className="text-neutral-800 dark:text-neutral-100">
                  <strong>{invite.sender_name}</strong> ti ha invitato a partecipare a{' '}
                  <strong>{invite.project_name}</strong>.
                </p>
                {invite.project_description && (
                  <p className="mt-1 text-neutral-600 dark:text-neutral-300">{invite.project_description}</p>
                )}
              </div>

              {actionError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  {actionError}
                </p>
              )}

              {invite.user_exists ? (
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Accetta
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Rifiuta
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    Non hai ancora un account su PapérDex. Per accettare, crealo con l'indirizzo a cui hai ricevuto
                    l'invito — non è possibile usarne uno diverso.
                  </p>

                  <form onSubmit={handleRegisterSubmit} className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Nome">
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Mario"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Cognome">
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Rossi"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="Email" hint="Bloccata sull'indirizzo a cui è stato mandato l'invito.">
                      <input
                        type="email"
                        value={invite.receiver_email}
                        disabled
                        className={`${inputClass} cursor-not-allowed opacity-70`}
                      />
                    </Field>
                    <Field label="Password">
                      <PasswordInput
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                    </Field>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? 'Creazione account…' : 'Crea account e accetta'}
                    </button>

                    <button
                      type="button"
                      onClick={handleDecline}
                      disabled={actionLoading}
                      className="w-full text-center text-sm text-neutral-500 hover:underline dark:text-neutral-400"
                    >
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
