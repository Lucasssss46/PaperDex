import { apiRequest } from './client'

export function getInvite(token) {
  return apiRequest(`/inviti/${token}`)
}

export function acceptInvite(token) {
  return apiRequest(`/inviti/${token}/accept`, { method: 'POST' })
}

export function declineInvite(token) {
  return apiRequest(`/inviti/${token}/decline`, { method: 'POST' })
}
