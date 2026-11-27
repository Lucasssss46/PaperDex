import { Link, NavLink, Outlet } from 'react-router-dom'
import Footer from './Footer'
import Logo, { Wordmark } from './Logo'
import ProfileMenu from './ProfileMenu'

const navLinkBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const navLinkActive = 'bg-[color-mix(in_srgb,_var(--color-blue)_15%,_transparent)] text-ink-3'
const navLinkInactive = 'text-ink-4 hover:bg-border'

function navLinkClass({ isActive }) {
  return `${navLinkBase} ${isActive ? navLinkActive : navLinkInactive}`
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'h-5 w-5 shrink-0',
}

function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export default function AppLayout({ onLogout }) {
  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          {/* La Home vera e propria esiste solo prima del login: da autenticati
              il logo porta alla pagina principale dell'app. */}
          {/* A schermi stretti sparisce prima il wordmark testuale, poi (più
              stretti ancora, dentro ProfileMenu) il nome dell'account: resta
              sempre almeno il sigillo, mai testo tagliato a metà. */}
          <Link to="/ricerche" className="flex shrink-0 items-center gap-2">
            <Logo size={28} />
            <Wordmark size={19} className="hidden sm:inline" />
          </Link>

          {/* Da qui in poi, ogni nuova pagina di navigazione globale va indicizzata qui. */}
          <nav className="flex items-center gap-2">
            {/* Su telefono restano le icone: le etichette mandavano a capo l'header. */}
            <NavLink to="/ricerche" className={navLinkClass} aria-label="Ricerche">
              <FolderIcon />
              <span className="hidden sm:inline">Ricerche</span>
            </NavLink>
            <NavLink to="/ricerca/articoli" className={navLinkClass} aria-label="Ricerca rapida">
              <SearchIcon />
              <span className="hidden sm:inline">Ricerca rapida</span>
            </NavLink>
          </nav>
        </div>

        <ProfileMenu onLogout={onLogout} />
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-4 text-ink-1 sm:px-10 lg:px-20">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
