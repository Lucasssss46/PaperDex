export const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition-shadow placeholder:text-neutral-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'

export default function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">{hint}</span>}
    </label>
  )
}
