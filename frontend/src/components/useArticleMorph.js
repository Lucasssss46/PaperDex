import { useRef } from 'react'
import { flushSync } from 'react-dom'

// Un solo nome alla volta nella pagina: viene dato all'elemento d'origine
// (riga/anteprima) solo per l'istante della transizione, e in modo permanente
// alla card espansa (ExpandedArticleCard) — così il browser "trasforma"
// l'una nell'altra.
export const ARTICLE_VT_NAME = 'article-expand'

function morph(update) {
  // Senza View Transitions (browser vecchi) o con riduzione del movimento
  // attiva: stesso risultato, solo senza animazione.
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return null
  }
  return document.startViewTransition(() => flushSync(update))
}

// Animazione "a espansione" (riga → card al centro e ritorno) con le View
// Transitions native invece di una libreria di animazione: `open(el, update)`
// parte dall'elemento cliccato, `close(update)` torna allo stesso elemento.
export function useArticleMorph() {
  const originRef = useRef(null)

  function open(originEl, update) {
    originRef.current = originEl
    if (originEl) originEl.style.viewTransitionName = ARTICLE_VT_NAME
    morph(() => {
      if (originEl) originEl.style.viewTransitionName = ''
      update()
    })
  }

  function close(update) {
    const el = originRef.current?.isConnected ? originRef.current : null
    const transition = morph(() => {
      update()
      if (el) el.style.viewTransitionName = ARTICLE_VT_NAME
    })
    const clear = () => {
      if (el) el.style.viewTransitionName = ''
    }
    if (transition) transition.finished.finally(clear)
    else clear()
  }

  return { open, close }
}
