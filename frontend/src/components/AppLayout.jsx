import { Link, NavLink, Outlet } from 'react-router-dom'
import Footer from './Footer'
import Logo, { Wordmark } from './Logo'
import ProfileMenu from './ProfileMenu'

const navLinkBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors'
const navLinkActive = 'bg-[rgba(43,124,255,.15)] text-[#9CC2FF]'
const navLinkInactive = 'text-[#8B93A5] hover:bg-[#1B2130]'

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
    <div className="flex min-h-svh flex-col bg-[#030407]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1B2130] bg-[#0C1119] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-6">
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

      <main className="min-w-0 flex-1 overflow-y-auto px-6 text-[#F3F4F6] sm:px-10 lg:px-20">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
