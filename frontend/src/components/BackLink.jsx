import { Link } from 'react-router-dom'

// Freccia "Torna a X" per risalire di un livello nella gerarchia della pagina
// (es. da una sotto-pagina di una Ricerca alla sua Overview, o da una
// sotto-pagina del Profilo al Profilo stesso): una destinazione fissa e
// prevedibile, non la cronologia del browser (che dipende da come ci si è
// arrivati, non da dove "si dovrebbe" tornare).
export default function BackLink({ to, label }) {
  return (
    <Link to={to} className="back-link">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      Torna a {label}
    </Link>
  )
}
