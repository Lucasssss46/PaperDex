import { useEffect, useRef, useState } from 'react'
import { getCurrentUser, requestPasswordReset } from '../api/auth'
import { addEmail, changePassword, requestEmailConfirmation, updateProfile, uploadAvatar } from '../api/profile'
import Field, { inputClass } from '../components/Field'
import PasswordInput from '../components/PasswordInput'

const sectionClass =
  'rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/5'
const saveButtonClass =
  'rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60'

function InfoSection({ user, onUpdated }) {
  const [username, setUsername] = useState(user.username)
  const [institution, setInstitution] = useState(user.institution ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const result = await updateProfile({ username, institution })
      onUpdated(result)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sectionClass}>
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Informazioni personali</h3>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[10rem] flex-1">
            <Field label="Nome">
              <input value={user.name} disabled className={`${inputClass} cursor-not-allowed opacity-70`} />
            </Field>
          </div>
          <div className="min-w-[10rem] flex-1">
            <Field label="Username">
              <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[10rem] flex-1">
            <Field label="Istituzione">
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Università, ente, azienda…"
                className={inputClass}
              />
            </Field>
          </div>
          <button type="submit" disabled={saving} className={saveButtonClass}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Salvato.</p>}
      </div>
    </form>
  )
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function AvatarUpload({ user, onUpdated }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const result = await uploadAvatar(file)
      onUpdated(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        <img
          src={user.profile_img}
          alt=""
          className="h-32 w-32 rounded-full border border-violet-200 object-cover dark:border-violet-500/30"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Cambia immagine profilo"
          className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-900"
        >
          <PencilIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
      {uploading && <p className="text-xs text-neutral-500 dark:text-neutral-400">Caricamento…</p>}
      {error && <p className="max-w-[10rem] text-center text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function EmailSection({ user }) {
  const [newEmail, setNewEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)

  const mainConfirmed = user.confirmed_emails?.includes(user.email)

  async function handleAdd(event) {
    event.preventDefault()
    if (!newEmail.trim()) return
    setAdding(true)
    setError('')
    setSentTo('')
    try {
      await addEmail(newEmail.trim())
      setSentTo(newEmail.trim())
      setNewEmail('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleConfirmRequest() {
    setConfirming(true)
    setConfirmError('')
    setConfirmSent(false)
    try {
      await requestEmailConfirmation()
      setConfirmSent(true)
    } catch (err) {
      setConfirmError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Email</h3>
      <div className="mt-4 space-y-4">
        <Field label="Email principale" hint="Non modificabile.">
          <div className="flex items-center gap-2">
            <input value={user.email} disabled className={`${inputClass} cursor-not-allowed opacity-70`} />
            {mainConfirmed ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                Confermata
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                Da confermare
              </span>
            )}
          </div>
        </Field>
        {!mainConfirmed && (
          <div>
            <button
              type="button"
              onClick={handleConfirmRequest}
              disabled={confirming}
              className="text-sm font-medium text-violet-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-400"
            >
              {confirming ? 'Invio…' : 'Invia email di conferma'}
            </button>
            {confirmSent && (
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                Email inviata: controlla la posta in arrivo.
              </p>
            )}
            {confirmError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{confirmError}</p>}
          </div>
        )}

        {user.additional_emails?.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">Altre email</p>
            <ul className="space-y-1">
              {user.additional_emails.map((email) => (
                <li
                  key={email}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                >
                  {email}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Aggiungi un'altra email" hint="Aggiunta all'account dopo la conferma via link.">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="altra@email.com"
                className={inputClass}
              />
            </Field>
          </div>
          <button type="submit" disabled={adding} className={saveButtonClass}>
            {adding ? 'Invio…' : '+ Aggiungi'}
          </button>
        </form>
        {sentTo && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Email di conferma inviata a {sentTo}.
          </p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </section>
  )
}

// Non più mostrato (l'utente ha chiesto di passare solo dal flusso email
// "Password dimenticata?", decisione ancora provvisoria): codice tenuto
// pronto per un eventuale ripristino, invece di essere riscritto da capo.
// eslint-disable-next-line no-unused-vars
function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaved(false)
    if (newPassword !== confirmPassword) {
      setError('Le due password non coincidono.')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sectionClass}>
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Password</h3>
      <div className="mt-4 space-y-4">
        <Field label="Password attuale">
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="Nuova password">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Field label="Conferma nuova password">
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Password aggiornata.</p>}
        <button type="submit" disabled={saving} className={saveButtonClass}>
          {saving ? 'Aggiornamento…' : 'Aggiorna password'}
        </button>
      </div>
    </form>
  )
}

function PasswordResetSection({ email }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleClick() {
    setSending(true)
    setError('')
    setSent(false)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={sectionClass}>
      <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Password</h3>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Ti mandiamo un'email a <strong>{email}</strong> con un link per reimpostarla.
      </p>
      <button type="button" onClick={handleClick} disabled={sending} className={`mt-4 ${saveButtonClass}`}>
        {sending ? 'Invio…' : 'Invia email per reimpostare la password'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {sent && (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          Email inviata: controlla la posta in arrivo.
        </p>
      )}
    </section>
  )
}

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch((err) => setError(err.message))
  }, [])

  function handleUpdated(partial) {
    setUser((u) => ({ ...u, ...partial }))
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h2 className="mb-6 text-xl font-semibold text-neutral-900 dark:text-neutral-50">Impostazioni profilo</h2>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!user ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Caricamento…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            <AvatarUpload user={user} onUpdated={handleUpdated} />
            <div className="w-full flex-1">
              <InfoSection user={user} onUpdated={handleUpdated} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <EmailSection user={user} />
            <PasswordResetSection email={user.email} />
          </div>
        </div>
      )}
    </div>
  )
}
