import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { listRicercaCronologia } from '../api/ricerche'
import HistoryEntryItem from '../components/HistoryEntryItem'

const PAGE_SIZE = 20

export default function HistoryPage() {
  const { researchId } = useOutletContext()
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listRicercaCronologia(researchId, { page, pageSize: PAGE_SIZE })
      .then((result) => {
        setData(result)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [researchId, page])

  function goToPage(newPage) {
    setLoading(true)
    setPage(newPage)
  }

  if (loading && !data) {
    return (
      <p className="text-sm" style={{ color: '#8B93A5' }}>
        Caricamento…
      </p>
    )
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: '#FCA5A5' }}>
        {error}
      </p>
    )
  }

  return (
    <div className="max-w-3xl">
      {data.count === 0 ? (
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Nessuna aggiunta registrata per ora.
        </p>
      ) : (
        <>
          <ul>
            {data.entries.map((entry) => (
              <HistoryEntryItem key={entry.id} entry={entry} />
            ))}
          </ul>

          {data.total_pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1} className="ghost-btn">
                ← Precedente
              </button>
              <span className="text-sm" style={{ color: '#8B93A5' }}>
                Pagina {data.page} di {data.total_pages}
              </span>
              <button type="button" onClick={() => goToPage(page + 1)} disabled={page >= data.total_pages} className="ghost-btn">
                Successiva →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
