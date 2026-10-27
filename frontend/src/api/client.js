export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
export const TOKEN_KEY = 'paperdex_token'

// Registrato da App al mount: riporta l'utente al login quando una richiesta
// autenticata torna 401 (token scaduto/invalido), non quando è /login stesso
// a rifiutare credenziali sbagliate (in quel caso non c'è token da allegare).
let sessionExpiredHandler = null
export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler
}

/**
 * Chiama l'API backend. Con `form` manda application/x-www-form-urlencoded
 * (richiesto da /login, che usa OAuth2PasswordRequestForm), con `formData`
 * manda multipart/form-data (upload di file), altrimenti JSON.
 * Allega automaticamente il token salvato in localStorage, se presente.
 */
export async function apiRequest(path, { method = 'GET', body, form, formData } = {}) {
  const headers = {}
  let payload

  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  if (formData) {
    // Niente Content-Type manuale: il browser imposta il boundary multipart corretto.
    payload = formData
  } else if (form) {
    payload = new URLSearchParams(form)
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) {
      sessionExpiredHandler?.()
    }

    const detail = data?.detail
    const message = Array.isArray(detail)
      ? detail.map((d) => d.msg).join('; ')
      : detail || `Errore ${response.status}`
    throw new Error(message)
  }

  return data
}
