import { useLocation } from 'react-router-dom'

const COPY = {
  enrich: {
    empty: 'Nessun esito da mostrare: questa pagina si raggiunge da "Vedi dettagli" nel toast dopo aver lanciato "Arricchisci selezionati" dal menu Manutenzione di Overview.',
  },
  update: {
    empty: 'Nessun esito da mostrare: questa pagina si raggiunge da "Vedi dettagli" nel toast dopo aver lanciato "Aggiorna selezionati" dal menu Manutenzione di Overview.',
  },
}

// Dettaglio per-articolo di un'azione bulk di Overview (Arricchisci
// selezionati/Aggiorna selezionati): i dati arrivano via stato di navigazione (lo
// stesso meccanismo già usato da "Usa" per le query salvate), non da una
// chiamata server — l'esito di un'azione già conclusa non è altro da
// recuperare, e non è pensato per essere raggiunto direttamente via URL
// (da qui lo stato vuoto sotto se qualcuno ci arriva senza passare dal
// toast, es. un link salvato o un refresh della pagina). Titolo e
// BackLink non sono qui: li mostra già ResearchLayout (barra condivisa da
// tutte le sotto-pagine di una Ricerca), come per Team/Query salvate.
export default function MaintenanceResultsView({ kind }) {
  const location = useLocation()
  const result = location.state?.result ?? null
  const copy = COPY[kind]

  return (
    <div className="max-w-3xl">
      {result && (
        <p className="text-sm">
          {result.parts.map((p, i) => (
            <span key={i} style={{ color: p.color }}>
              {i > 0 ? ' · ' : ''}
              {p.text}
            </span>
          ))}
        </p>
      )}

      {!result ? (
        <p className="mt-4 text-sm" style={{ color: '#8B93A5' }}>
          {copy.empty}
        </p>
      ) : result.detailRows.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: '#8B93A5' }}>
          Nessun dettaglio per articolo per questo esito.
        </p>
      ) : (
        <ul className="mt-4">
          {result.detailRows.map((row, i) => (
            <li key={i} className="row">
              <span className="min-w-0 flex-1 truncate text-sm" style={{ color: '#F3F4F6' }} title={row.title}>
                {row.title}
              </span>
              {row.msg && (
                <span className="shrink-0 text-xs" style={{ color: row.color }}>
                  {row.msg}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
