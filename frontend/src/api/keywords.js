import { apiRequest } from './client'

export function expandKeywords(terms) {
  return apiRequest('/keywords/expand', { method: 'POST', body: { terms } })
}
