import { apiRequest } from './client'

export function getCurrentUser() {
  return apiRequest('/users/me')
}

export function login(email, password) {
  return apiRequest('/login', {
    method: 'POST',
    form: { username: email, password },
  })
}

export function register(firstName, lastName, email, password, inviteToken) {
  return apiRequest('/users', {
    method: 'POST',
    body: { first_name: firstName, last_name: lastName, email, password, invite_token: inviteToken },
  })
}

export function requestPasswordReset(email) {
  return apiRequest('/password-reset/request', { method: 'POST', body: { email } })
}

export function confirmPasswordReset(token, newPassword) {
  return apiRequest('/password-reset/confirm', {
    method: 'POST',
    body: { token, new_password: newPassword },
  })
}

export function confirmEmail(token) {
  return apiRequest('/confirm-email', { method: 'POST', body: { token } })
}
