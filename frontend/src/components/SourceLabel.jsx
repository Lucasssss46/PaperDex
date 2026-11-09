import SourceIcon from './SourceIcon'
import { SOURCE_LOGOS } from '../sourceLogos'

export default function SourceLabel({ name, logoClassName = 'h-5' }) {
  const logo = SOURCE_LOGOS[name]

  if (!logo) return <span>{name}</span>

  return (
    <span className="inline-flex items-center gap-2">
      <SourceIcon name={name} className={logoClassName} />
      {!logo.wordmark && <span>{name}</span>}
    </span>
  )
}
