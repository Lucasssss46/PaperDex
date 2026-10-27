import { Link, NavLink, Outlet } from 'react-router-dom'
import Footer from './Footer'
import ProfileMenu from './ProfileMenu'

const navLinkBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const navLinkActive = 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
const navLinkInactive =
  'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'

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
    <div className="flex min-h-svh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
        <div className="flex flex-wrap items-center gap-6">
          {/* La Home vera e propria esiste solo prima del login: da autenticati
              il logo porta alla pagina principale dell'app. */}
          {/* Sacrificato per ultimo, a schermi ancora più stretti del nome
              account nel ProfileMenu: prima si perde il nome, poi il logo si
              riduce alla sola "P". */}
          <Link
            to="/ricerche"
            className="shrink-0 tracking-wide text-white"
            style={{
              fontFamily: '"Luckiest Guy", cursive',
              WebkitTextStroke: '1.5px #7c3aed',
              textShadow: '2px 2px 0 rgba(0,0,0,0.3)',
              fontSize: '1.5rem',
            }}
          >
            <span className="hidden sm:inline">PapérDex</span>
            <span className="sm:hidden">P</span>
          </Link>

          {/* Da qui in poi, ogni nuova pagina di navigazione globale va indicizzata qui. */}
          <nav className="flex items-center gap-2">
            <NavLink to="/ricerche" className={navLinkClass}>
              <FolderIcon />
              <span>Ricerche</span>
            </NavLink>
            <NavLink to="/ricerca/articoli" className={navLinkClass}>
              <SearchIcon />
              <span>Ricerca rapida</span>
            </NavLink>
          </nav>
        </div>

        <ProfileMenu onLogout={onLogout} />
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 sm:px-10 lg:px-20">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
