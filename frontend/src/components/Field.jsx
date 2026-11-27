export const inputClass =
  'w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-ink-1 outline-none transition-shadow placeholder:text-ink-5 focus:border-blue focus:ring-2 focus:ring-[color-mix(in_srgb,_var(--color-blue)_30%,_transparent)]'

export default function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-5">{hint}</span>}
    </label>
  )
}
