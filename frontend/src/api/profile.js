import { apiRequest } from './client'

export function updateProfile(data) {
  return apiRequest('/users/me', { method: 'PATCH', body: data })
}

export function changePassword(currentPassword, newPassword) {
  return apiRequest('/users/me/password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  })
}

export function addEmail(email) {
  return apiRequest('/users/me/emails', { method: 'POST', body: { email } })
}

export function requestEmailConfirmation() {
  return apiRequest('/users/me/confirm-email/request', { method: 'POST' })
}

export function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest('/users/me/avatar', { method: 'POST', formData })
}

export function getApiKeys() {
  return apiRequest('/users/me/api-keys')
}

export function setApiKey(sourceId, apiKey) {
  return apiRequest(`/users/me/api-keys/${sourceId}`, { method: 'PUT', body: { api_key: apiKey } })
}

export function setApiKeySharing(sourceId, projectIds) {
  return apiRequest(`/users/me/api-keys/${sourceId}/sharing`, {
    method: 'PUT',
    body: { project_ids: projectIds },
  })
}

export function getLlmConfig() {
  return apiRequest('/users/me/llm')
}

export function setLlmConfig(provider, apiKey) {
  return apiRequest('/users/me/llm', { method: 'PUT', body: { provider, api_key: apiKey } })
}

export function getMyInvites() {
  return apiRequest('/users/me/invites')
}
