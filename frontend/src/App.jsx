import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TOKEN_KEY, setSessionExpiredHandler } from './api/client'
import AuthForm from './components/AuthForm'
import AppLayout from './components/AppLayout'
import ResearchLayout from './components/ResearchLayout'
import ApiKeysPage from './pages/ApiKeysPage'
import ConfermaEmailPage from './pages/ConfermaEmailPage'
import DeduplicationPage from './pages/DeduplicationPage'
import EnrichAllResultsPage from './pages/EnrichAllResultsPage'
import HistoryPage from './pages/HistoryPage'
import HomePage from './pages/HomePage'
import InvitePage from './pages/InvitePage'
import MyInvitesPage from './pages/MyInvitesPage'
import ProfilePage from './pages/ProfilePage'
import OverviewPage from './pages/OverviewPage'
import PublicSearchPage from './pages/PublicSearchPage'
import QuickSearchPage from './pages/QuickSearchPage'
import ResearchesPage from './pages/ResearchesPage'
import ResearchSearchPage from './pages/ResearchSearchPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SavedQueriesPage from './pages/SavedQueriesPage'
import SessionDuplicatesPage from './pages/SessionDuplicatesPage'
import SessionEnrichPage from './pages/SessionEnrichPage'
import TeamPage from './pages/TeamPage'
import UpdateAllResultsPage from './pages/UpdateAllResultsPage'

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [showAuth, setShowAuth] = useState(false)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState('')

  useEffect(() => {
    setSessionExpiredHandler(() => {
      localStorage.removeItem(TOKEN_KEY)
      setToken(null)
      setShowAuth(true)
      setSessionExpiredNotice('Sessione scaduta: accedi di nuovo.')
    })
  }, [])

  function handleAuthenticated(newToken) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setShowAuth(false)
    setSessionExpiredNotice('')
  }

  function goToLogin() {
    setSessionExpiredNotice('')
    setShowAuth(true)
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Raggiungibile da chiunque apra il link ricevuto via email, anche
            senza sessione attiva (o con una sessione attiva in un'altra
            scheda): per questo sta fuori dal ramo autenticato sotto. */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/conferma-email" element={<ConfermaEmailPage />} />
        <Route path="/inviti/accetta" element={<InvitePage />} />

        {!token ? (
          <>
            {/* Alternativa alla pagina di accesso: consultabile senza login,
                come la ricerca rapida da autenticati ma senza possibilità di
                salvare (nessuna Ricerca a cui appartenere). */}
            <Route path="ricerca/articoli" element={<PublicSearchPage onLoginClick={goToLogin} />} />
            {/* Indirizzo precedente, per i collegamenti già salvati. */}
            <Route path="ricerca/paper" element={<Navigate to="/ricerca/articoli" replace />} />
            <Route
              path="*"
              element={
                showAuth ? (
                  <AuthForm onAuthenticated={handleAuthenticated} initialNotice={sessionExpiredNotice} />
                ) : (
                  <HomePage onLoginClick={goToLogin} />
                )
              }
            />
          </>
        ) : (
          <Route element={<AppLayout onLogout={handleLogout} />}>
            <Route index element={<Navigate to="/ricerche" replace />} />
            <Route path="ricerche" element={<ResearchesPage />} />
            <Route path="ricerche/:id" element={<ResearchLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="cerca" element={<ResearchSearchPage />} />
              <Route path="query-salvate" element={<SavedQueriesPage />} />
              <Route path="cronologia" element={<HistoryPage />} />
              <Route path="deduplicazione" element={<DeduplicationPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="sessione/duplicati" element={<SessionDuplicatesPage />} />
              <Route path="sessione/arricchisci" element={<SessionEnrichPage />} />
              <Route path="manutenzione/arricchisci-tutti" element={<EnrichAllResultsPage />} />
              <Route path="manutenzione/aggiorna-tutti" element={<UpdateAllResultsPage />} />
            </Route>
            <Route path="profilo" element={<ProfilePage />} />
            <Route path="profilo/api-keys" element={<ApiKeysPage />} />
            <Route path="profilo/inviti" element={<MyInvitesPage />} />
            <Route path="ricerca" element={<Navigate to="/ricerca/articoli" replace />} />
            <Route path="ricerca/articoli" element={<QuickSearchPage />} />
            {/* Indirizzo precedente, per i collegamenti già salvati. */}
            <Route path="ricerca/paper" element={<Navigate to="/ricerca/articoli" replace />} />
            <Route path="*" element={<Navigate to="/ricerche" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
