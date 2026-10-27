import { SOURCE_LOGOS } from '../sourceLogos'

const CHIP_CLASSES = {
  light: 'bg-white shadow-sm ring-1 ring-black/5',
  dark: 'bg-neutral-900',
}

export default function SourceIcon({ name, className = 'h-5' }) {
  const logo = SOURCE_LOGOS[name]
  if (!logo) return null

  // `zoom` (a dimensione dal layout, a differenza di `transform: scale`) ingrandisce
  // l'immagine facendo crescere anche lo spazio che occupa, cosí i contenitori che le
  // si adattano attorno (come il pallino colorato nelle card dei risultati) la contengono
  // sempre per intero invece di lasciarla sbordare.
  const style = logo.scale ? { zoom: logo.scale } : undefined

  const image = (
    <>
      {logo.light && (
        <img
          src={logo.light}
          alt={name}
          style={style}
          className={`${className} w-auto object-contain ${logo.dark ? 'dark:hidden' : ''}`}
        />
      )}
      {logo.dark && (
        <img
          src={logo.dark}
          alt={name}
          style={style}
          className={`${className} w-auto object-contain ${logo.light ? 'hidden dark:block' : ''}`}
        />
      )}
    </>
  )

  if (!logo.chip) return image

  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-1 ${CHIP_CLASSES[logo.chip]}`}>
      {image}
    </span>
  )
}
