import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../api/auth'
import Field from '../components/Field'
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
        <p className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Reimposta la password
        </p>

        {done ? (
          <div className="mt-6 space-y-4 text-center">
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Password aggiornata. Ora puoi accedere.
            </p>
            <Link to="/" className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">
              Torna al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Nuova password">
              <PasswordInput
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Conferma nuova password">
              <PasswordInput
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Aggiornamento…' : 'Reimposta password'}
            </button>

            <p className="text-center text-sm">
              <Link to="/" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
                Torna al login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
