import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, requestPasswordReset } from '../api/auth'
import Field, { inputClass } from './Field'
import Logo, { Wordmark } from './Logo'
import PasswordInput from './PasswordInput'
import Spinner from './Spinner'

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
    <div className="auth-page">
      <div className="card w-full max-w-sm" style={{ padding: '34px 32px 30px' }}>
        <div className="flex flex-col items-center gap-2.5">
          <Logo size={52} />
          <Wordmark size={24} />
          <div className="text-sm" style={{ color: '#8B93A5' }}>
            {isForgot ? 'Reimposta la password' : isLogin ? 'Accedi al tuo account' : 'Crea un nuovo account'}
          </div>
        </div>

        {!isForgot && (
          <div className="tab-wrap" style={{ marginTop: 24 }}>
            <button type="button" className={`tab ${isLogin ? 'active' : ''}`} onClick={() => switchMode('login')}>
              Accedi
            </button>
            <button type="button" className={`tab ${!isLogin ? 'active' : ''}`} onClick={() => switchMode('register')}>
              Registrati
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={{ marginTop: 22 }}>
          {!isLogin && !isForgot && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome">
                <input type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" className={inputClass} />
              </Field>
              <Field label="Cognome">
                <input type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" className={inputClass} />
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
              <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          )}

          {isLogin && (
            <p className="text-right">
              <button type="button" onClick={() => switchMode('forgot')} className="action-link">
                Password dimenticata?
              </button>
            </p>
          )}

          {error && <p className="notice-err">{error}</p>}
          {notice && <p className="notice-ok">{notice}</p>}

          <button type="submit" disabled={loading} className="pill-btn flex w-full items-center justify-center gap-2" style={{ padding: '11px 0' }}>
            {loading && <Spinner />}
            {isForgot ? 'Invia link di ripristino' : isLogin ? 'Accedi' : 'Crea account'}
          </button>

          {isForgot && (
            <p className="text-center text-sm">
              <button type="button" onClick={() => switchMode('login')} className="action-link">
                Torna al login
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
