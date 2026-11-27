import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { listDuplicateGroups, listRicercaTeam } from '../api/ricerche'
import DuplicateGroupReview from '../components/DuplicateGroupReview'
import SourcePriorityEditor from '../components/SourcePriorityEditor'

export default function DeduplicationPage() {
  const { researchId } = useOutletContext()
  const [groups, setGroups] = useState(null)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    listDuplicateGroups(researchId)
      .then((data) => setGroups(data.groups))
      .catch((err) => setError(err.message))
  }, [researchId])

  // Solo per sapere se mostrare la classifica delle sorgenti come
  // modificabile: un fallimento qui non deve rompere il resto della pagina,
  // che resta in sola lettura (isOwner di default false). Un secondo tentativo
  // automatico (il backend può essere in avvio), poi un avviso con Riprova.
  const [roleFailed, setRoleFailed] = useState(false)

  function fetchRole(isRetry) {
    listRicercaTeam(researchId)
      .then((data) => {
        setIsOwner(data.is_owner)
        setRoleFailed(false)
      })
      .catch(() => {
        if (isRetry) setRoleFailed(true)
        else setTimeout(() => fetchRole(true), 1500)
      })
  }

  useEffect(() => {
    fetchRole(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ricarica solo cambiando Ricerca
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

  return (
    <div className="flex flex-col-reverse gap-6 md:flex-row md:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        {error ? (
          <p className="text-sm" style={{ color: 'var(--color-err)' }}>
            {error}
          </p>
        ) : !groups ? (
          <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
            Caricamento…
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
            Nessun gruppo di duplicati per ora.
          </p>
        ) : (
          groups.map((group) => (
            <DuplicateGroupReview key={group.id} researchId={researchId} group={group} onUpdated={handleUpdated} />
          ))
        )}
      </div>

      {/* Impostazione della Ricerca in una sidebar a destra, non in cima alla
          pagina: visibile a prescindere dal fatto che ci siano già gruppi da
          rivedere (si può scegliere l'ordine anche prima di aggiungere il
          primo gruppo), ma senza spingere in basso i gruppi già presenti.
          `sticky` solo da `md` in su: sotto quella soglia le colonne si
          impilano (classifica in fondo, `flex-col-reverse` sopra la mette
          comunque prima) e uno sticky non avrebbe senso. */}
      <aside className="w-full shrink-0 md:sticky md:top-8 md:w-72">
        {roleFailed && (
          <div className="notice-warn mb-3 text-xs">
            <p>Non riesco a verificare il tuo ruolo: la classifica delle sorgenti resta in sola lettura.</p>
            <button
              type="button"
              className="action-link mt-1.5"
              onClick={() => {
                setRoleFailed(false)
                fetchRole(true)
              }}
            >
              Riprova
            </button>
          </div>
        )}
        <SourcePriorityEditor researchId={researchId} isOwner={isOwner} />
      </aside>
    </div>
  )
}
