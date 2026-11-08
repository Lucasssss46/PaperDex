import { API_BASE_URL, apiRequest, TOKEN_KEY } from './client'

export function listRicerche() {
  return apiRequest('/ricerche')
}

export function getRicerca(id) {
  return apiRequest(`/ricerche/${id}`)
}

export function createRicerca(name, description) {
  return apiRequest('/ricerche', { method: 'POST', body: { name, description } })
}

export function deleteRicerca(id) {
  return apiRequest(`/ricerche/${id}`, { method: 'DELETE' })
}

export function addArticleToRicerca(id, article) {
  return apiRequest(`/ricerche/${id}/articoli`, { method: 'POST', body: { article } })
}

export function addArticleGroupToRicerca(id, articles) {
  return apiRequest(`/ricerche/${id}/articoli/group`, { method: 'POST', body: { articles } })
}

export function enrichArticle(id, articleId) {
  return apiRequest(`/ricerche/${id}/articoli/${encodeURIComponent(articleId)}/enrich`, { method: 'POST' })
}

export function enrichAllArticles(id) {
  return apiRequest(`/ricerche/${id}/articoli/enrich-all`, { method: 'POST' })
}

export function checkAllArticlesVersion(id) {
  return apiRequest(`/ricerche/${id}/articoli/check-version-all`, { method: 'POST' })
}

export function checkArticleVersion(id, articleId) {
  return apiRequest(`/ricerche/${id}/articoli/${encodeURIComponent(articleId)}/check-version`, { method: 'POST' })
}

export function listDuplicateGroups(id) {
  return apiRequest(`/ricerche/${id}/duplicate-groups`)
}

export function chooseDuplicate(id, groupId, articleId) {
  return apiRequest(`/ricerche/${id}/duplicate-groups/${groupId}/choose`, {
    method: 'POST',
    body: { article_id: articleId },
  })
}

export function getSourcePriority(id) {
  return apiRequest(`/ricerche/${id}/source-priority`)
}

export function setSourcePriority(id, sources) {
  return apiRequest(`/ricerche/${id}/source-priority`, { method: 'PUT', body: { sources } })
}

export function listRicercaArticles(id, { page = 1, pageSize = 20 } = {}) {
  return apiRequest(`/ricerche/${id}/articoli?page=${page}&page_size=${pageSize}`)
}

export function listRicercaTeam(id) {
  return apiRequest(`/ricerche/${id}/team`)
}

export function removeRicercaTeamMember(id, userId) {
  return apiRequest(`/ricerche/${id}/team/${userId}`, { method: 'DELETE' })
}

export function leaveRicerca(id) {
  return apiRequest(`/ricerche/${id}/leave`, { method: 'POST' })
}

export function removeRicercaArticle(id, articleId) {
  return apiRequest(`/ricerche/${id}/articoli/${encodeURIComponent(articleId)}`, { method: 'DELETE' })
}

export function listRicercaCronologia(id, { page = 1, pageSize = 20 } = {}) {
  return apiRequest(`/ricerche/${id}/cronologia?page=${page}&page_size=${pageSize}`)
}

export function listRicercaQueries(id) {
  return apiRequest(`/ricerche/${id}/query`)
}

export function createRicercaQuery(id, data) {
  return apiRequest(`/ricerche/${id}/query`, { method: 'POST', body: data })
}

export function inviteToRicerca(id, email) {
  return apiRequest(`/ricerche/${id}/invite`, { method: 'POST', body: { email } })
}

export function listRicercaInvites(id) {
  return apiRequest(`/ricerche/${id}/invites`)
}

// Non passa da apiRequest: la risposta non è JSON (file grezzo, formato a
// scelta), va letta come blob e il nome file va letto dall'header invece che
// assunto lato client.
export async function exportRicercaArticles(id, format) {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = token ? { Authorization: `Bearer ${token}` } : {}

  const response = await fetch(`${API_BASE_URL}/ricerche/${id}/export?format=${format}`, { headers })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || `Errore ${response.status}`)
  }

  const disposition = response.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : `export.${format}`

  const blob = await response.blob()
  return { blob, filename }
}
