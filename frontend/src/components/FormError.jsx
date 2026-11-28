import { useEffect, useRef } from 'react'

// Errore dell'invio di un modulo: annunciato subito (role="alert") e con il
// focus, così chi usa la tastiera o un lettore di schermo lo trova senza cercarlo.
export default function FormError({ message, className, style }) {
  const ref = useRef(null)

  useEffect(() => {
    if (message) ref.current?.focus()
  }, [message])

  if (!message) return null
  return (
    <p ref={ref} tabIndex={-1} role="alert" className={className} style={style}>
      {message}
    </p>
  )
}
