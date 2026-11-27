import { Link } from 'react-router-dom'
import { ALL_SOURCES } from '../constants'
import SourceLabel from './SourceLabel'

export default function SourcesPanel({ sources, onToggle, error, missingKeys = [], loggedIn = false }) {
  const selectedWithoutKey = missingKeys.filter((name) => sources.includes(name))

  return (
    <aside className="card min-w-0" style={{ padding: 0, flex: '1 1 220px' }}>
      <div className="ribbon-flat">Sorgenti</div>
      <div className="flex flex-col gap-1.5" style={{ padding: '14px 16px' }}>
        {ALL_SOURCES.map((name) => (
          <label
            key={name}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--color-ink-2)' }}
          >
            <input
              type="checkbox"
              checked={sources.includes(name)}
              onChange={() => onToggle(name)}
              className="h-4 w-4 rounded"
              style={{ accentColor: 'var(--color-blue)' }}
            />
            <SourceLabel name={name} />
          </label>
        ))}
      </div>

      {selectedWithoutKey.map((name) => (
        <p key={name} className="text-xs" style={{ margin: '0 16px 12px', color: 'var(--color-warn)' }}>
          <strong>{name}</strong> richiede una chiave API e non ne hai una, né tua né condivisa dal team: senza,
          verrà saltata.{' '}
          {loggedIn ? (
            <Link to="/profilo/api-keys" className="font-medium underline">
              Imposta la chiave
            </Link>
          ) : (
            'Accedi per impostarne una.'
          )}
        </p>
      ))}

      {error && (
        <p className="text-xs font-medium" style={{ margin: '0 16px 12px', color: 'var(--color-err)' }}>
          {error}
        </p>
      )}
    </aside>
  )
}
