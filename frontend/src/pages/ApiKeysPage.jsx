import { useEffect, useState } from 'react'
import { getApiKeys, getLlmConfig, setApiKey, setApiKeySharing, setLlmConfig } from '../api/profile'
import BackLink from '../components/BackLink'
import Field, { inputClass } from '../components/Field'
import PasswordInput from '../components/PasswordInput'

const sectionClass =
  'rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5'
const saveButtonClass =
  'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60'

// Condivisione disattivata di default: attivabile ricerca per ricerca, così
// gli altri membri di quel team beneficiano dei suoi limiti di frequenza più
// alti senza che la chiave stessa sia mai loro visibile (usata solo lato
// server, e solo per chi non ha già una propria chiave per quella sorgente).
function ShareSection({ source, researches, onSharingUpdated }) {
  const [open, setOpen] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState('')

  if (researches.length === 0) return null

  async function toggle(projectId) {
    const next = source.shared_with.includes(projectId)
      ? source.shared_with.filter((id) => id !== projectId)
      : [...source.shared_with, projectId]

    setSavingId(projectId)
    setError('')
    try {
      const result = await setApiKeySharing(source.id, next)
      onSharingUpdated(source.id, result.shared_with)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="mt-3 border-t border-violet-200/60 pt-3 dark:border-violet-500/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
      >
        {open ? '− Nascondi condivisione' : '+ Condividi con una Ricerca'}
        {source.shared_with.length > 0 && ` (${source.shared_with.length} attiva/e)`}
      </button>

      {open && (
        <>
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            Le Ricerche selezionate usano questa chiave per chi, tra i loro membri, non ne ha già una propria per
            questa sorgente. Il valore della chiave non viene mai mostrato agli altri membri.
          </p>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
            {researches.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={source.shared_with.includes(r.id)}
                  disabled={savingId === r.id}
                  onChange={() => toggle(r.id)}
                  className="accent-violet-600"
                />
                <span className="truncate">{r.name}</span>
              </label>
            ))}
          </div>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </div>
  )
}

function SourceKeyCard({ source, researches, onUpdated, onSharingUpdated }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(newValue) {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await setApiKey(source.id, newValue)
      onUpdated(source.id, result.is_set)
      setValue('')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!value.trim()) return
    save(value.trim())
  }

  return (
    <form onSubmit={handleSubmit} className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">{source.name}</h3>
        <div className="flex items-center gap-3">
          {source.is_set && (
            <>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                Impostata
              </span>
              <button
                type="button"
                onClick={() => save('')}
                disabled={saving}
                className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
              >
                Rimuovi
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <Field
            label="Chiave API"
            hint={
              source.is_set
                ? "Lascia vuoto: inserisci un nuovo valore solo per sostituirla."
                : source.required
                  ? 'Obbligatoria: senza una chiave, tua o condivisa da un membro del team, questa sorgente viene saltata nelle ricerche.'
                  : 'Non obbligatoria: senza chiave le ricerche funzionano comunque, con limiti di frequenza più bassi.'
            }
          >
            <PasswordInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={source.is_set ? '••••••••' : 'Incolla qui la chiave'}
            />
          </Field>
        </div>
        <button type="submit" disabled={saving || !value.trim()} className={saveButtonClass}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Salvata.</p>}

      {source.is_set && (
        <ShareSection source={source} researches={researches} onSharingUpdated={onSharingUpdated} />
      )}
    </form>
  )
}

function LlmKeyCard({ config, onUpdated }) {
  const [provider, setProvider] = useState(config.provider ?? config.providers[0]?.id ?? '')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(nextProvider, nextValue) {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await setLlmConfig(nextProvider, nextValue)
      onUpdated(result)
      setValue('')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!value.trim()) return
    save(provider, value.trim())
  }

  const currentProviderName = config.providers.find((p) => p.id === config.provider)?.name

  return (
    <form onSubmit={handleSubmit} className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Assistente AI</h3>
        <div className="flex items-center gap-3">
          {config.is_set && (
            <>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                Impostata ({currentProviderName})
              </span>
              <button
                type="button"
                onClick={() => save(config.provider, '')}
                disabled={saving}
                className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400"
              >
                Rimuovi
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        Usata per suggerire varianti e acronimi durante la ricerca. Senza una chiave, viene usato un dizionario
        statico dei termini più comuni.
      </p>
      <div className="mt-4 flex items-end gap-3">
        <div className="w-36 shrink-0">
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass}>
              {config.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex-1">
          <Field
            label="Chiave API"
            hint={config.is_set ? "Lascia vuoto: inserisci un nuovo valore solo per sostituirla." : undefined}
          >
            <PasswordInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.is_set ? '••••••••' : 'Incolla qui la chiave'}
            />
          </Field>
        </div>
        <button type="submit" disabled={saving || !value.trim()} className={saveButtonClass}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Salvata.</p>}
    </form>
  )
}

export default function ApiKeysPage() {
  const [sources, setSources] = useState(null)
  const [researches, setResearches] = useState([])
  const [llmConfig, setLlmConfigState] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getApiKeys()
      .then((data) => {
        setSources(data.sources)
        setResearches(data.researches)
      })
      .catch((err) => setError(err.message))
    getLlmConfig()
      .then(setLlmConfigState)
      .catch((err) => setError(err.message))
  }, [])

  function handleUpdated(sourceId, isSet) {
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, is_set: isSet } : s)))
  }

  function handleSharingUpdated(sourceId, sharedWith) {
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, shared_with: sharedWith } : s)))
  }

  function handleLlmUpdated(result) {
    setLlmConfigState((prev) => ({ ...prev, provider: result.provider, is_set: result.is_set }))
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">API keys</h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Solo le sorgenti che supportano una chiave API personale per aumentare i propri limiti di frequenza
            compaiono qui sotto; le altre non ne richiedono una.
          </p>
        </div>
        <BackLink to="/profilo" label="Profilo" />
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!sources || !llmConfig ? (
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
      ) : (
        <div className="mt-6 space-y-6">
          {sources.map((source) => (
            <SourceKeyCard
              key={source.id}
              source={source}
              researches={researches}
              onUpdated={handleUpdated}
              onSharingUpdated={handleSharingUpdated}
            />
          ))}
          <LlmKeyCard config={llmConfig} onUpdated={handleLlmUpdated} />
        </div>
      )}
    </div>
  )
}
