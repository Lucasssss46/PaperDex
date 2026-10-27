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
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  }

  return (
    <div className="max-w-3xl">
      {data.count === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nessuna aggiunta registrata per ora.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.entries.map((entry) => (
              <HistoryEntryItem key={entry.id} entry={entry} />
            ))}
          </ul>

          {data.total_pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                ← Precedente
              </button>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Pagina {data.page} di {data.total_pages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= data.total_pages}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Successiva →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
