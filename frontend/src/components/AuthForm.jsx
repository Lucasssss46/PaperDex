import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, requestPasswordReset } from '../api/auth'
import PasswordInput from './PasswordInput'
import Spinner from './Spinner'
import Field, { inputClass } from './Field'

export default function AuthForm({ onAuthenticated, initialNotice }) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(initialNotice || '')

  const isLogin = mode === 'login'
  const isForgot = mode === 'forgot'

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      if (isForgot) {
        const data = await requestPasswordReset(email)
        setNotice(data.message)
      } else if (isLogin) {
        const data = await login(email, password)
        onAuthenticated(data.access_token)
        // L'URL nella barra degli indirizzi potrebbe essere rimasto quello
        // di una pagina specifica (es. un vecchio bookmark, o un link diretto
        // aperto da sloggati): l'accesso deve sempre riportare a "Ricerche",
        // non continuare da lì.
        navigate('/ricerche', { replace: true })
      } else {
        await register(firstName, lastName, email, password)
        setNotice('Account creato! Ora puoi accedere.')
        setMode('login')
        setPassword('')
      }
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
          className="text-center text-4xl tracking-wide text-white"
          style={{
            fontFamily: '"Luckiest Guy", cursive',
            WebkitTextStroke: '2px #7c3aed',
            textShadow: '3px 3px 0 rgba(0,0,0,0.3)',
          }}
        >
          PapérDex
        </h1>
        <p className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {isForgot ? 'Reimposta la password' : isLogin ? 'Accedi al tuo account' : 'Crea un nuovo account'}
        </p>

        {!isForgot && (
          <div className="mt-6 grid grid-cols-2 rounded-lg bg-neutral-100 p-1 text-sm font-medium dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-md py-1.5 transition-colors ${
                isLogin
                  ? 'bg-white text-violet-700 shadow-sm dark:bg-neutral-700 dark:text-violet-300'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Accedi
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-md py-1.5 transition-colors ${
                !isLogin
                  ? 'bg-white text-violet-700 shadow-sm dark:bg-neutral-700 dark:text-violet-300'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Registrati
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!isLogin && !isForgot && (
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
          )}

          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario.rossi@example.com"
              className={inputClass}
            />
          </Field>

          {!isForgot && (
            <Field label="Password">
              <PasswordInput
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          )}

          {isLogin && (
            <p className="text-right">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
              >
                Password dimenticata?
              </button>
            </p>
          )}

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <Spinner />}
            {isForgot ? 'Invia link di ripristino' : isLogin ? 'Accedi' : 'Crea account'}
          </button>

          {isForgot && (
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-violet-600 hover:underline dark:text-violet-400"
              >
                Torna al login
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
