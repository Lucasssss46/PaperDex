import { useEffect, useState } from 'react'

// Il backend gratuito del deploy di prova si addormenta: dopo una pausa la
// prima richiesta può durare circa un minuto. Dopo 4 secondi lo si dice.
export function LoadingNote({ className = 'text-sm' }) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <p className={className} style={{ color: 'var(--color-ink-4)' }}>
      Caricamento…
      {slow && ' Il server si sta avviando: la prima apertura dopo una pausa può richiedere fino a un minuto.'}
    </p>
  )
}

// Al posto dei dati quando il caricamento fallisce: mai una lista vuota che
// sembri "non c'è niente".
export function LoadError({ what, message, onRetry, className = '' }) {
  return (
    <div className={`notice-err ${className}`}>
      <p>Non riesco a caricare {what}. Il server potrebbe essere in avvio: riprova tra qualche secondo.</p>
      {message && (
        <p className="mt-1 text-xs" style={{ opacity: 0.8 }}>
          Dettaglio: {message}
        </p>
      )}
      {onRetry && (
        <button type="button" className="pill-btn mt-3" onClick={onRetry}>
          Riprova
        </button>
      )}
    </div>
  )
}
