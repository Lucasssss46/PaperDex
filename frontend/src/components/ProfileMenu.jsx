import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { getCurrentUser } from '../api/auth'

const linkActive = 'bg-[rgba(43,124,255,.15)] text-[#9CC2FF]'
const linkInactive = 'text-[#8B93A5] hover:bg-[#1B2130]'

const subLinkBase = 'block rounded-lg px-3 py-1.5 text-sm transition-colors text-right'

function subLinkClass({ isActive }) {
  return `${subLinkBase} ${isActive ? linkActive : linkInactive}`
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function ChevronDownIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function ProfileMenu({ onLogout }) {
  const location = useLocation()
  const isProfileSection = location.pathname.startsWith('/profilo')
  // `null` finché l'utente non ha ancora scelto manualmente: segue la sezione attiva.
  const [manualOpen, setManualOpen] = useState(null)
  const [user, setUser] = useState(null)
  const open = manualOpen ?? isProfileSection
  const previousPathname = useRef(location.pathname)
  const menuRef = useRef(null)

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => {})
  }, [])

  // Chiude la tendina quando si cambia pagina (es. cliccando "Profilo" o
  // "API keys" al suo interno), ma non al primo render: altrimenti si
  // perderebbe l'apertura automatica quando si atterra già su /profilo.
  useEffect(() => {
    if (previousPathname.current !== location.pathname) {
      setManualOpen(false)
      previousPathname.current = location.pathname
    }
  }, [location.pathname])

  // Chiude la tendina al click fuori da essa (bottone incluso, altrimenti
  // riaprirebbe subito dopo la chiusura).
  useEffect(() => {
    if (!open) return
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setManualOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const displayName = user?.name ?? 'Profilo'

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isProfileSection ? linkActive : linkInactive
        }`}
      >
        {user?.profile_img ? (
          <img src={user.profile_img} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
        ) : (
          <UserIcon />
        )}
        {/* Primo a sparire quando lo schermo si stringe (prima del logo
            nell'header, che si riduce alla sola "P" a una soglia ancora più
            stretta): resta solo l'immagine account. */}
        <span className="hidden max-w-[10rem] truncate md:inline">{displayName}</span>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div className="card absolute right-0 top-full z-10 mt-1 w-32 space-y-1 p-2">
          <NavLink to="/profilo" end className={subLinkClass}>
            Profilo
          </NavLink>
          <NavLink to="/profilo/api-keys" className={subLinkClass}>
            API keys
          </NavLink>
          <NavLink to="/profilo/inviti" className={subLinkClass}>
            Inviti
          </NavLink>
          <hr className="my-1 border-[#1B2130]" />
          <button
            type="button"
            onClick={onLogout}
            className={`${subLinkBase} flex w-full items-center justify-end gap-2 ${linkInactive}`}
          >
            Esci
            <LogoutIcon />
          </button>
        </div>
      )}
    </div>
  )
}
