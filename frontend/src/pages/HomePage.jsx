import { Link } from 'react-router-dom'

export default function HomePage({ onLoginClick }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-neutral-50 px-6 py-16 text-center dark:bg-neutral-950">
      <h1
        className="text-7xl tracking-wide text-white"
        style={{
          fontFamily: '"Luckiest Guy", cursive',
          WebkitTextStroke: '3px #7c3aed',
          textShadow: '4px 4px 0 rgba(0,0,0,0.3)',
        }}
      >
        PapérDex
      </h1>
      <p className="mt-3 text-lg italic text-violet-600 dark:text-violet-400">Gotta find 'em all</p>

      <p className="mt-8 max-w-xl text-neutral-600 dark:text-neutral-300">
        PapérDex aggrega e confronta articoli accademici da più sorgenti — arXiv, Crossref, DBLP, OpenAlex
        e Semantic Scholar — in un'unica ricerca, per costruire la tua rassegna della letteratura
        senza saltare da un motore all'altro.
      </p>

      <div className="mt-10 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onLoginClick}
          className="rounded-lg bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Accedi
        </button>
        <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">o</span>
        <Link
          to="/ricerca/articoli"
          className="w-52 rounded-lg border border-violet-300 px-6 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10"
        >
          Prova la ricerca rapida
        </Link>
      </div>
    </div>
  )
}
