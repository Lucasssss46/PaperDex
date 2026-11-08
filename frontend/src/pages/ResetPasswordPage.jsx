import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../api/auth'
import Field from '../components/Field'
import Logo, { Wordmark } from '../components/Logo'
import PasswordInput from '../components/PasswordInput'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!token) {
      setError('Link non valido: manca il token di reimpostazione.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }

    setLoading(true)
    try {
      await confirmPasswordReset(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="card w-full max-w-sm" style={{ padding: '34px 32px 30px' }}>
        <div className="flex flex-col items-center gap-2.5">
          <Logo size={44} />
          <Wordmark size={21} />
          <div className="text-sm" style={{ color: '#8B93A5' }}>
            Reimposta la password
          </div>
        </div>

        {done ? (
          <div className="mt-6 flex flex-col items-center gap-3.5 text-center">
            <p className="notice-ok">Password aggiornata. Ora puoi accedere.</p>
            <Link to="/" className="action-link">
              Torna al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <Field label="Nuova password">
              <PasswordInput required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Field label="Conferma nuova password">
              <PasswordInput required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
            </Field>

            {error && <p className="notice-err">{error}</p>}

            <button type="submit" disabled={loading} className="pill-btn w-full" style={{ padding: '11px 0' }}>
              {loading ? 'Aggiornamento…' : 'Reimposta password'}
            </button>

            <p className="text-center text-sm">
              <Link to="/" className="action-link">
                Torna al login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
