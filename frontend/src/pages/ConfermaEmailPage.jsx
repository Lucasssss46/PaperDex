import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmEmail } from '../api/auth'

export default function ConfermaEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Link non valido: manca il token di conferma.')
      return
    }
    confirmEmail(token)
      .then(() => setStatus('done'))
      .catch((err) => {
        setStatus('error')
        setError(err.message)
      })
  }, [token])

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
        <p className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">Conferma email</p>

        <div className="mt-6 space-y-4 text-center">
          {status === 'loading' && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Conferma in corso…</p>
          )}
          {status === 'done' && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Email confermata.
            </p>
          )}
          {status === 'error' && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          <Link to="/" className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400">
            Torna a PapérDex
          </Link>
        </div>
      </div>
    </div>
  )
}
