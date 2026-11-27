import { Link } from 'react-router-dom'
import Logo, { Wordmark } from '../components/Logo'

export default function HomePage({ onLoginClick }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-6 py-16 text-center" style={{ background: 'var(--color-bg)' }}>
      <div className="watermark" />

      <div className="relative z-10 flex max-w-xl flex-col items-center" style={{ zIndex: 1 }}>
        <div style={{ filter: 'drop-shadow(0 10px 28px color-mix(in srgb, var(--color-blue) 35%, transparent))' }}>
          <Logo size={124} />
        </div>
        <div style={{ marginTop: 22 }}>
          <Wordmark size={58} />
        </div>
        <p className="mt-1.5 text-lg italic" style={{ color: 'var(--color-lime)' }}>
          Gotta find 'em all
        </p>

        <p className="mt-6 text-sm" style={{ color: 'var(--color-ink-4)', lineHeight: 1.7 }}>
          PapérDex aggrega e confronta articoli accademici da più sorgenti — arXiv, Crossref, DBLP, OpenAlex
          e Semantic Scholar — in un'unica ricerca, per costruire la tua rassegna della letteratura
          senza saltare da un motore all'altro.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3.5">
          <button type="button" onClick={onLoginClick} className="pill-btn">
            Accedi
          </button>
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-ink-5)' }}>
            oppure
          </span>
          <Link to="/ricerca/articoli" className="ghost-btn-lg">
            Prova la ricerca rapida
          </Link>
        </div>
      </div>
    </div>
  )
}
