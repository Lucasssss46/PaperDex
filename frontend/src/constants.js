export const ALL_SOURCES = ['ArXiv', 'Crossref', 'DBLP', 'OpenAlex', 'Semantic Scholar']

// Colore pillola per sorgente (token --color-src-* in index.css), stabilito nel canvas di design e usato
// ovunque un articolo mostri la sua provenienza (dial, liste, risultati).
export const SOURCE_COLORS = {
  ArXiv: { bg: 'var(--color-src-arxiv-bg)', color: 'var(--color-src-arxiv)' },
  OpenAlex: { bg: 'var(--color-src-openalex-bg)', color: 'var(--color-src-openalex)' },
  Crossref: { bg: 'var(--color-src-crossref-bg)', color: 'var(--color-src-crossref)' },
  'Semantic Scholar': { bg: 'var(--color-src-s2-bg)', color: 'var(--color-src-s2)' },
  DBLP: { bg: 'var(--color-src-dblp-bg)', color: 'var(--color-src-dblp)' },
}
