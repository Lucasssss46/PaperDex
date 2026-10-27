import { Link } from 'react-router-dom'
import { ALL_SOURCES } from '../constants'
import SourceLabel from './SourceLabel'

export default function SourcesPanel({ sources, onToggle, error, missingKeys = [], loggedIn = false }) {
  const selectedWithoutKey = missingKeys.filter((name) => sources.includes(name))

  return (
    <aside className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5">
      <h2 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Sorgenti</h2>

      <div className="mt-4 flex flex-col gap-1.5">
        {ALL_SOURCES.map((name) => (
          <label
            key={name}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-white/70 dark:text-neutral-200 dark:hover:bg-neutral-800/70"
          >
            <input
              type="checkbox"
              checked={sources.includes(name)}
              onChange={() => onToggle(name)}
              className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-2 focus:ring-violet-500/40 dark:border-neutral-600"
            />
            <SourceLabel name={name} />
          </label>
        ))}
      </div>

      {selectedWithoutKey.map((name) => (
        <p
          key={name}
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
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

      {error && <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </aside>
  )
}
