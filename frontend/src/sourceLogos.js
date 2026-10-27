import arxivDark from './assets/logos/arxiv-dark.svg'
import dblpWordmark from './assets/logos/dblp-wordmark.png'
import openalexLight from './assets/logos/openalex-light.svg'
import openalexDark from './assets/logos/openalex-dark.svg'
import semanticScholarLight from './assets/logos/semanticscholar-light.svg'
import semanticScholarDark from './assets/logos/semanticscholar-dark.svg'

// Referenziato direttamente dal dominio ufficiale Crossref, senza scaricarlo,
// come richiesto dalle loro linee guida di branding.
const CROSSREF_LOGO_URL = 'https://assets.crossref.org/logo/crossref-logo-landscape-200.svg'

// `wordmark: true` = il logo include già il nome scritto (non va ripetuto come testo).
// `light`/`dark` = varianti da alternare col tema dell'app (quando presenti entrambe).
// `chip` = sfondo dedicato ('light' | 'dark') necessario quando esiste una sola
// variante e non è leggibile sul tema opposto dell'app.
export const SOURCE_LOGOS = {
  // Unico logo ufficiale completo trovato finora: variante "Darkmode".
  // Da rivedere quando sarà disponibile una versione per sfondi chiari.
  ArXiv: { wordmark: true, dark: arxivDark, chip: 'dark' },
  // Ingrandito: il testo del logo ufficiale (grigio scuro fisso) è altrimenti
  // poco leggibile in tema scuro senza uno sfondo dedicato.
  Crossref: { wordmark: true, light: CROSSREF_LOGO_URL, scale: 1.35 },
  // Ingrandito per la stessa ragione di Crossref: testo grigio fisso, poco
  // leggibile in tema scuro senza uno sfondo dedicato. Da rivedere in futuro.
  DBLP: { wordmark: true, light: dblpWordmark, scale: 1.35 },
  OpenAlex: { wordmark: true, light: openalexLight, dark: openalexDark },
  'Semantic Scholar': { wordmark: true, light: semanticScholarLight, dark: semanticScholarDark },
}
