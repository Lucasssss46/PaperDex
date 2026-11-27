import { useLayoutEffect, useRef, useState } from 'react'

// Conferma prima delle azioni irreversibili, in un <dialog> modale nativo come
// ExpandedArticleCard (focus, Esc e blocco dello scroll gestiti dal browser).
// "Annulla" ha il focus all'apertura: Invio per sbaglio non cancella nulla.
// `requireText`: testo da riscrivere per abilitare la conferma (per le
// cancellazioni più gravi, come un'intera Ricerca).
export default function ConfirmDialog({ request, onDone }) {
  const dialogRef = useRef(null)
  const [typed, setTyped] = useState('')

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (request && dialog && !dialog.open) dialog.showModal()
  }, [request])

  if (!request) return null

  const { title, message, confirmLabel = 'Conferma', requireText } = request
  const canConfirm = !requireText || typed.trim() === requireText.trim()

  function close(ok) {
    dialogRef.current?.close()
    setTyped('')
    onDone(ok)
  }

  return (
    <dialog
      ref={dialogRef}
      className="article-dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        close(false)
      }}
    >
      <div className="card article-dialog-card">
        <h2 id="confirm-dialog-title" className="head text-lg font-semibold" style={{ color: 'var(--color-ink-1)' }}>
          {title}
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
          {message}
        </p>
        {requireText && (
          <label className="mt-4 block text-sm" style={{ color: 'var(--color-ink-2)' }}>
            Per confermare, scrivi <strong style={{ color: 'var(--color-ink-1)' }}>{requireText}</strong>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--color-overlay)', border: '1.5px solid var(--color-border)', color: 'var(--color-ink-1)' }}
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="ghost-btn" autoFocus onClick={() => close(false)}>
            Annulla
          </button>
          <button type="button" className="pill-btn pill-btn-danger" disabled={!canConfirm} onClick={() => close(true)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
