import { SOURCE_LOGOS } from '../sourceLogos'

const CHIP_CLASSES = {
  light: 'bg-white shadow-sm ring-1 ring-black/5',
  dark: 'bg-[#0C1119]',
}

export default function SourceIcon({ name, className = 'h-5' }) {
  const logo = SOURCE_LOGOS[name]
  if (!logo) return null

  // `zoom` (a dimensione dal layout, a differenza di `transform: scale`) ingrandisce
  // l'immagine facendo crescere anche lo spazio che occupa, cosí i contenitori che le
  // si adattano attorno (come il pallino colorato nelle card dei risultati) la contengono
  // sempre per intero invece di lasciarla sbordare.
  const style = logo.scale ? { zoom: logo.scale } : undefined

  // L'app è sempre scura adesso (nessun toggle chiaro/scuro): la scelta
  // light/dark dell'asset non può più seguire il `dark:` di Tailwind, che
  // segue le preferenze di sistema dell'OS — indipendenti dal nostro
  // `color-scheme` forzato. Si preferisce semplicemente la variante dark,
  // se esiste, altrimenti quella light.
  const src = logo.dark ?? logo.light
  const image = <img src={src} alt={name} style={style} className={`${className} w-auto object-contain`} />

  if (!logo.chip) return image

  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-1 ${CHIP_CLASSES[logo.chip]}`}>{image}</span>
  )
}
