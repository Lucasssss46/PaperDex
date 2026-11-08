import { Link, useNavigate } from 'react-router-dom'
import Footer from '../components/Footer'
import Logo, { Wordmark } from '../components/Logo'
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
    <div className="flex min-h-svh flex-col bg-[#030407]">
      <header className="flex items-center justify-between gap-4 border-b border-[#1B2130] bg-[#0C1119] px-4 py-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <Logo size={28} />
          <Wordmark size={19} />
        </Link>
        <button type="button" onClick={handleLoginClick} className="pill-btn">
          Accedi
        </button>
      </header>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 text-[#F3F4F6] sm:px-10 lg:px-20">
        <SearchArticlesPage />
      </main>

      <Footer />
    </div>
  )
}
