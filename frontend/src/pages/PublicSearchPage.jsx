import { Link, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import SearchArticlesPage from './SearchArticlesPage'

// Ricerca rapida raggiungibile senza login, come alternativa alla pagina di
// accesso: header minimale (nessun menu profilo/nav autenticata, solo logo e
// "Accedi") invece di AppLayout, che presuppone un utente loggato.
export default function PublicSearchPage({ onLoginClick }) {
  const navigate = useNavigate()

  function handleLoginClick() {
    onLoginClick()
    navigate('/')
  }

  return (
    <div className="flex min-h-svh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900 sm:px-6">
        <Link
          to="/"
          className="shrink-0 tracking-wide text-white"
          style={{
            fontFamily: '"Luckiest Guy", cursive',
            WebkitTextStroke: '1.5px #7c3aed',
            textShadow: '2px 2px 0 rgba(0,0,0,0.3)',
            fontSize: '1.5rem',
          }}
        >
          PapérDex
        </Link>
        <button
          type="button"
          onClick={handleLoginClick}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Accedi
        </button>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10 lg:px-20">
        <SearchArticlesPage />
      </main>

      <Footer />
    </div>
  )
}
