import { useId } from 'react'

// Ottagono esterno (percentuali del clip-path CSS originale: polygon(30%
// 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%),
// qui riportato su un viewBox 0-100) e lo stesso ottagono rimpicciolito di
// un margine fisso (il "contorno" lime che prima era un secondo livello di
// div con lo stesso clip-path, inset di 1px — qui lo stesso trucco ma
// come due path nello stesso albero SVG, non due box DOM sovrapposti).
const MARGIN = 1

function octagonPoints(x0, y0, size) {
  const a = size * 0.3
  const b = size * 0.7
  const x1 = x0 + size
  const y1 = y0 + size
  return [
    [x0 + a, y0],
    [x0 + b, y0],
    [x1, y0 + a],
    [x1, y0 + b],
    [x0 + b, y1],
    [x0 + a, y1],
    [x0, y0 + b],
    [x0, y0 + a],
  ]
    .map((p) => p.join(','))
    .join(' ')
}

const OUTER_OCT = octagonPoints(0, 0, 100)
const INNER_OCT = octagonPoints(MARGIN, MARGIN, 100 - MARGIN * 2)
const RING_OCT = octagonPoints(33, 33, 34)
const DOT_OCT = octagonPoints(36, 36, 28)

// Il sigillo ottagonale definitivo, come SVG invece che `<div>` impilati
// con `clip-path` — vedi il canvas di design, board "S — logo
// definitivo", per la geometria originale. Un SVG compone le forme nello
// stesso albero vettoriale, quindi niente più delle lineette di
// anti-aliasing viste ai bordi quando l'intero logo veniva ruotato (ogni
// `clip-path` su `<div>` separati viene rasterizzato per conto suo prima
// di essere ruotato — con l'SVG è tutto un'unica composizione vettoriale,
// ruotata insieme). `rotate` (gradi) è usato dalla ruota (ArticleDial):
// ruota un `<g>` interno attorno al centro, non l'elemento stesso.
export default function Logo({ size = 28, className = '', rotate = 0, style }) {
  const clipId = useId()
  // `size` numerico = dimensione fissa in px (uso normale, header/hero);
  // una stringa (es. "100%") lo fa invece riempire il contenitore — serve
  // alla ruota, dove la dimensione del logo segue quella di `.dial`
  // (fissata in CSS, con breakpoint propri) invece di un valore JS fisso.
  const isFixed = typeof size === 'number'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ ...(isFixed ? { flex: `0 0 ${size}px` } : null), ...style }}
    >
      <g transform={rotate ? `rotate(${rotate} 50 50)` : undefined}>
        <polygon points={OUTER_OCT} fill="var(--color-lime)" />
        <clipPath id={clipId}>
          <polygon points={INNER_OCT} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="100" height="50" fill="var(--color-blue)" />
          <rect x="0" y="50" width="100" height="50" fill="var(--color-bg)" />
        </g>
        <polygon points={RING_OCT} fill="var(--color-blue)" />
        <polygon points={DOT_OCT} fill="var(--color-lime)" />
      </g>
    </svg>
  )
}

// Wordmark testuale separato dal logo (restano due elementi modulari: un
// marchio fuso testo+logo è stato provato nel canvas e scartato — a
// piccola scala il testo finisce illeggibile sopra la forma).
export function Wordmark({ size = 19, className = '' }) {
  return (
    <span className={`head ${className}`.trim()} style={{ fontSize: size, fontWeight: 800 }}>
      PapérDex
    </span>
  )
}
