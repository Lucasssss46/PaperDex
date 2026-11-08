import { useRef, useState } from 'react'
import Logo from './Logo'

// Parametri della ruota, fissati nel canvas di design (board X/Y): VISIBLE
// righe piene a schermo, STEP px per riga (= 1 "scatto" di scroll), la
// ruota gira di DEG_PER_STEP gradi per ogni riga scorsa.
const VISIBLE = 6
const STEP = 58
const DEG_PER_STEP = 42

// Ruota rotante + scroll nativo sincronizzato: il meccanismo si usa SOLO
// per vere collezioni di articoli (Overview "Articoli salvati", Risultati
// di ricerca) — mai per liste semplici (Team, Query salvate...), per non
// diventare un vezzo ridondante applicato ovunque.
//
// `items`: array di oggetti con almeno `id` e `caught` (bool — pieno/vuoto
// il pallino). `renderItem(item, index)` restituisce il contenuto della
// riga (numero, titolo, pillola sorgente...): il pallino caught/seen e il
// posizionamento/la curvatura sono già gestiti qui. `selectedId`/`onSelect`
// pilotano la riga aperta (striscia di dettaglio, gestita dal chiamante).
export default function ArticleDial({ items, renderItem, selectedId, onSelect }) {
  const [scrollPos, setScrollPos] = useState(0)
  const scrollRef = useRef(null)
  const maxOffset = Math.max(items.length - VISIBLE, 0)

  function move(deltaSteps) {
    const el = scrollRef.current
    if (!el) return
    const current = Math.round(scrollPos / STEP)
    const target = Math.max(0, Math.min(maxOffset, current + deltaSteps)) * STEP
    if (el.scrollTo) el.scrollTo({ top: target, behavior: 'smooth' })
    else el.scrollTop = target
  }

  const centerIndex = scrollPos / STEP + (VISIBLE - 1) / 2
  const offset = Math.round(scrollPos / STEP)
  const trackHeight = items.length * STEP
  const angle = (scrollPos / STEP) * DEG_PER_STEP
  const thumbTop = maxOffset === 0 ? 7 : Math.round((offset / maxOffset) * 86) + 7

  return (
    <div className="dial-row">
      <div
        className="scroll-zone dial-row-list"
        style={{ height: 348 }}
        ref={scrollRef}
        onScroll={(e) => setScrollPos(e.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: trackHeight }}>
          {items.map((item, i) => {
            const dist = i - centerIndex
            const angleDeg = Math.max(-90, Math.min(90, (dist / (VISIBLE / 2)) * 90))
            const angleRad = (angleDeg * Math.PI) / 180
            const curve = Math.cos(angleRad)
            const shift = Math.round(2 + (26 - 2) * curve)
            const half = VISIBLE / 2
            const absDist = Math.abs(dist)
            const opacity = absDist <= half ? 1 : Math.max(0, 1 - (absDist - half))
            const selected = item.id === selectedId

            return (
              <div
                key={item.id}
                className="row-pill"
                style={{
                  top: i * STEP,
                  transform: `translateX(-${shift}px)`,
                  opacity,
                  background: item.caught ? 'rgba(212,255,36,.06)' : 'transparent',
                  boxShadow: selected ? '0 0 0 2px #2B7CFF inset' : 'none',
                }}
                onClick={() => onSelect?.(selected ? null : item.id)}
              >
                <div className={item.caught ? 'dot-caught' : 'dot-seen'} />
                {renderItem(item, i)}
              </div>
            )
          })}
        </div>
      </div>

      <div className="dial">
        <div className="dial-spin">
          <Logo size="100%" rotate={angle} style={{ position: 'absolute', inset: 0 }} />
        </div>
        <div className="dial-fixed">
          <div className="dial-arrow" onClick={() => move(-1)}>
            ▲
          </div>
          <div className="dial-arrow" onClick={() => move(1)}>
            ▼
          </div>
        </div>
      </div>

      <div className="track" style={{ height: 300 }}>
        <div className="track-thumb" style={{ top: `${thumbTop}%` }} />
      </div>
    </div>
  )
}
