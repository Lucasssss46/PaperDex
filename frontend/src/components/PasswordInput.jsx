import { useState } from 'react'
import { inputClass } from './Field'

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-3.06 4.2M6.6 6.6C3.2 8.6 1 12 1 12s4 8 11 8a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// Campo password con occhiolino per mostrare/nascondere il valore in chiaro,
// dentro la barra del campo stesso. Wrapper su un normale <input>, non su
// <Field>: resta compatibile ovunque un input password veniva usato dentro
// un <Field label="...">, cambia solo l'input al suo interno.
export default function PasswordInput({ className = inputClass, ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={`${className} pr-10`} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Nascondi password' : 'Mostra password'}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}
