import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { listDuplicateGroups } from '../api/ricerche'
import DuplicateGroupReview from '../components/DuplicateGroupReview'

// Stessa revisione della tab "Deduplicazione" (voce 71-73), ma filtrata ai
// soli gruppi che coinvolgono almeno un articolo aggiunto in questa sessione
// (vedi "Inizia una nuova sessione" in ResearchLayout) — una Ricerca attiva
// da mesi può avere decine di gruppi ormai irrilevanti rispetto a quello che
// si è appena aggiunto.
export default function SessionDuplicatesPage() {
  const { researchId, sessionArticles } = useOutletContext()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    listDuplicateGroups(researchId)
      .then((data) => setGroups(data.groups))
      .catch((err) => setError(err.message))
  }, [researchId])

  function handleUpdated(groupId, newChosenId) {
    setGroups((current) =>
      current.map((g) => {
        if (g.id !== groupId) return g
        const members = [g.chosen, ...g.alternatives]
        const newChosen = members.find((a) => a.id === newChosenId)
        const newAlternatives = members.filter((a) => a.id !== newChosenId)
        return { ...g, chosen: newChosen, alternatives: newAlternatives }
      }),
    )
  }

  const sessionIds = new Set(sessionArticles.map((a) => a.id))
  const sessionGroups = groups?.filter((g) => [g.chosen, ...g.alternatives].some((a) => sessionIds.has(a.id)))

  return (
    <div className="space-y-6">
      {sessionArticles.length === 0 ? (
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Nessun articolo aggiunto in questa sessione{' '}
          <Link to={`/ricerche/${researchId}/cerca`} className="action-link">
            torna a Cerca
          </Link>{' '}
          per aggiungerne.
        </p>
      ) : error ? (
        <p className="text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      ) : !sessionGroups ? (
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Caricamento…
        </p>
      ) : sessionGroups.length === 0 ? (
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Nessun duplicato tra gli articoli aggiunti in questa sessione.
        </p>
      ) : (
        sessionGroups.map((group) => (
          <DuplicateGroupReview key={group.id} researchId={researchId} group={group} onUpdated={handleUpdated} />
        ))
      )}

      {/* Passo intermedio del percorso guidato forzato: si può tornare
          indietro a Cerca (es. per aggiungere altro), ma si prosegue sempre
          verso Arricchisci con Zotero — mai direttamente all'Overview da
          qui. Cambiamenti già persistiti lato server (chooseDuplicate), non
          si perde nulla tornando indietro. */}
      <div className="flex justify-between border-t pt-6" style={{ borderColor: '#1B2130' }}>
        <Link to={`/ricerche/${researchId}/cerca`} className="ghost-btn" style={{ textDecoration: 'none' }}>
          ← Indietro
        </Link>
        <Link to={`/ricerche/${researchId}/sessione/arricchisci`} className="pill-btn" style={{ textDecoration: 'none' }}>
          Continua: arricchisci con Zotero →
        </Link>
      </div>
    </div>
  )
}
