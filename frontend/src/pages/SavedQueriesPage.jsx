import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { listRicercaQueries } from '../api/ricerche'
import QueryListItem from '../components/QueryListItem'

export default function SavedQueriesPage() {
  const { researchId } = useOutletContext()
  const navigate = useNavigate()
  const [queries, setQueries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listRicercaQueries(researchId)
      .then((data) => setQueries(data.queries))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId])

  function handleUse(query) {
    navigate(`/ricerche/${researchId}/cerca`, { state: { applyQuery: query } })
  }

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
        Caricamento…
      </p>
    )
  }

  if (error) {
    return (
      <p role="alert" className="text-sm" style={{ color: 'var(--color-err)' }}>
        {error}
      </p>
    )
  }

  if (queries.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-ink-4)' }}>
        Nessuna query salvata per ora. Puoi salvarne una dalla pagina "Cerca" di questa ricerca.
      </p>
    )
  }

  return (
    <ul className="max-w-3xl">
      {queries.map((query) => (
        <QueryListItem key={query.id} query={query} onUse={() => handleUse(query)} />
      ))}
    </ul>
  )
}
