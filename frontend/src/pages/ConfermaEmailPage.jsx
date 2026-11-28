import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmEmail } from '../api/auth'
import Logo, { Wordmark } from '../components/Logo'

export default function ConfermaEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState(() => (token ? 'loading' : 'error'))
  const [error, setError] = useState(() => (token ? '' : 'Link non valido: manca il token di conferma.'))

  useEffect(() => {
    if (!token) return
    confirmEmail(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setStatus('error')
        setError(err.message)
      })
  }, [token])

  return (
    <div className="auth-page">
      <div className="card w-full max-w-sm" style={{ padding: '34px 32px 30px' }}>
        <div className="flex flex-col items-center gap-2.5">
          <Logo size={44} />
          <Wordmark size={21} />
          <div className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
            Conferma email
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3.5 text-center">
          {status === 'loading' && (
            <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
              Conferma in corso…
            </p>
          )}
          {status === 'done' && <p role="status" className="notice-ok">Email confermata.</p>}
          {status === 'error' && <p role="alert" className="notice-err">{error}</p>}
          <Link to="/" className="action-link">
            Torna a PapérDex
          </Link>
        </div>
      </div>
    </div>
  )
}
