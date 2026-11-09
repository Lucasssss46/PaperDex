import { apiRequest } from './client'

// Sorgenti che richiedono una chiave API per cui l'utente non ne ha una (né
// propria né condivisa dal team della Ricerca): usato per avvisare nel form.
export function getKeyStatus(ricercaId) {
  const query = ricercaId ? `?ricerca_id=${encodeURIComponent(ricercaId)}` : ''
  return apiRequest(`/search/key-status${query}`)
}

export function searchArticles({
  keywordInclude,
  keywordExclude,
  author,
  journal,
  yearStart,
  yearEnd,
  depth,
  sources,
  ricercaId,
}) {
  return apiRequest('/search', {
    method: 'POST',
    body: {
      keyword_include: keywordInclude?.length ? keywordInclude : null,
      keyword_exclude: keywordExclude?.length ? keywordExclude : null,
      author: author?.length ? author : null,
      journal: journal?.length ? journal : null,
      year_start: yearStart ?? null,
      year_end: yearEnd ?? null,
      depth,
      sources: sources?.length ? sources : null,
      // Solo per risolvere le chiavi API condivise dagli altri membri del
      // team (vedi resolve_api_keys sul backend); assente per la ricerca
      // rapida, dentro o fuori dal sito.
      ricerca_id: ricercaId ?? null,
    },
  })
}
