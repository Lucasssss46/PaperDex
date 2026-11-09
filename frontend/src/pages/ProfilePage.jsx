import { useEffect, useRef, useState } from 'react'
import { getCurrentUser, requestPasswordReset } from '../api/auth'
import { addEmail, changePassword, requestEmailConfirmation, updateProfile, uploadAvatar } from '../api/profile'
import Field, { inputClass } from '../components/Field'
import Logo from '../components/Logo'
import PasswordInput from '../components/PasswordInput'

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Università, ente, azienda…" className={inputClass} />
          </Field>
        </div>
        <button type="submit" disabled={saving} className="pill-btn">
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
      {error && (
        <p className="text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm" style={{ color: '#6EE7B7' }}>
          Salvato.
        </p>
      )}
    </form>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
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
        <img src={user.profile_img} alt="" className="h-28 w-28 rounded-full object-cover" style={{ border: '2px solid #2B7CFF', background: '#1B2130' }} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Cambia immagine profilo"
          className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full text-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ border: '2px solid #0C1119', background: '#2B7CFF' }}
        >
          <PencilIcon />
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleFileChange} className="hidden" />
      </div>
      {uploading && (
        <p className="text-xs" style={{ color: '#8B93A5' }}>
          Caricamento…
        </p>
      )}
      {error && (
        <p className="max-w-[10rem] text-center text-xs" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}
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
    <section className="card" style={{ padding: 0 }}>
      <div className="ribbon-flat muted">Email</div>
      <div className="flex flex-col gap-4" style={{ padding: '18px 20px' }}>
        <Field label="Email principale" hint="Non modificabile.">
          <div className="flex items-center gap-2">
            <input value={user.email} disabled className={`${inputClass} cursor-not-allowed opacity-70`} />
            {mainConfirmed ? (
              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(16,185,129,.15)', color: '#6EE7B7' }}>
                Confermata
              </span>
            ) : (
              <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: 'rgba(217,119,6,.15)', color: '#FCD34D' }}>
                Da confermare
              </span>
            )}
          </div>
        </Field>
        {!mainConfirmed && (
          <div>
            <button type="button" onClick={handleConfirmRequest} disabled={confirming} className="action-link">
              {confirming ? 'Invio…' : 'Invia email di conferma'}
            </button>
            {confirmSent && (
              <p className="mt-1 text-sm" style={{ color: '#6EE7B7' }}>
                Email inviata: controlla la posta in arrivo.
              </p>
            )}
            {confirmError && (
              <p className="mt-1 text-sm" style={{ color: '#FCA5A5' }}>
                {confirmError}
              </p>
            )}
          </div>
        )}

        {user.additional_emails?.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium" style={{ color: '#C3C9D4' }}>
              Altre email
            </p>
            <ul className="space-y-1">
              {user.additional_emails.map((email) => (
                <li key={email} className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid #1B2130', background: '#0A0E16', color: '#C3C9D4' }}>
                  {email}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Aggiungi un'altra email" hint="Aggiunta all'account dopo la conferma via link.">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="altra@email.com" className={inputClass} />
            </Field>
          </div>
          <button type="submit" disabled={adding} className="pill-btn">
            {adding ? 'Invio…' : '+ Aggiungi'}
          </button>
        </form>
        {sentTo && (
          <p className="text-sm" style={{ color: '#6EE7B7' }}>
            Email di conferma inviata a {sentTo}.
          </p>
        )}
        {error && (
          <p className="text-sm" style={{ color: '#FCA5A5' }}>
            {error}
          </p>
        )}
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
    <form onSubmit={handleSubmit} className="card" style={{ padding: 20 }}>
      <h3 className="text-sm font-semibold" style={{ color: '#F3F4F6' }}>
        Password
      </h3>
      <div className="mt-4 space-y-4">
        <Field label="Password attuale">
          <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="Nuova password">
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
        </Field>
        <Field label="Conferma nuova password">
          <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
        </Field>
        {error && (
          <p className="text-sm" style={{ color: '#FCA5A5' }}>
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm" style={{ color: '#6EE7B7' }}>
            Password aggiornata.
          </p>
        )}
        <button type="submit" disabled={saving} className="pill-btn">
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
    <section className="card" style={{ padding: 0 }}>
      <div className="ribbon-flat muted">Password</div>
      <div style={{ padding: '18px 20px' }}>
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Ti mandiamo un'email a <strong style={{ color: '#C3C9D4' }}>{email}</strong> con un link per reimpostarla.
        </p>
        <button type="button" onClick={handleClick} disabled={sending} className="pill-btn mt-4">
          {sending ? 'Invio…' : 'Invia email per reimpostare la password'}
        </button>
        {error && (
          <p className="mt-2 text-sm" style={{ color: '#FCA5A5' }}>
            {error}
          </p>
        )}
        {sent && (
          <p className="mt-2 text-sm" style={{ color: '#6EE7B7' }}>
            Email inviata: controlla la posta in arrivo.
          </p>
        )}
      </div>
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h2 className="head mb-6 text-xl font-semibold" style={{ color: '#F3F4F6' }}>
        Impostazioni profilo
      </h2>

      {error && (
        <p className="text-sm" style={{ color: '#FCA5A5' }}>
          {error}
        </p>
      )}

      {!user ? (
        <p className="text-sm" style={{ color: '#8B93A5' }}>
          Caricamento…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Card con sigillo: è il gruppo primario (chi sei) — le altre due
              sono rifiniture dell'account, non la stessa cosa. */}
          <div className="card" style={{ padding: 0, position: 'relative', overflow: 'visible' }}>
            <div className="ribbon-flat">
              Informazioni personali
              <Logo size={54} className="card-seal" style={{ top: -18, right: -18 }} />
            </div>
            <div className="flex flex-wrap items-start gap-6" style={{ padding: '22px 24px' }}>
              <AvatarUpload user={user} onUpdated={handleUpdated} />
              <div className="min-w-[280px] flex-1">
                <InfoSection user={user} onUpdated={handleUpdated} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EmailSection user={user} />
            <PasswordResetSection email={user.email} />
          </div>
        </div>
      )}
    </div>
  )
}
