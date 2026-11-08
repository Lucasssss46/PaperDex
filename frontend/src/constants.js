export const ALL_SOURCES = ['ArXiv', 'Crossref', 'DBLP', 'OpenAlex', 'Semantic Scholar']

// Colore pillola per sorgente, stabilito nel canvas di design e usato
// ovunque un articolo mostri la sua provenienza (dial, liste, risultati).
export const SOURCE_COLORS = {
  ArXiv: { bg: 'rgba(43,124,255,.2)', color: '#9CC2FF' },
  OpenAlex: { bg: 'rgba(16,185,129,.18)', color: '#6EE7B7' },
  Crossref: { bg: 'rgba(248,113,113,.18)', color: '#FCA5A5' },
  'Semantic Scholar': { bg: 'rgba(236,72,153,.18)', color: '#F9A8D4' },
  DBLP: { bg: 'rgba(217,119,6,.2)', color: '#FCD34D' },
}
