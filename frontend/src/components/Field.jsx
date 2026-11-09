export const inputClass =
  'w-full rounded-lg border border-[#1B2130] bg-[#0A0E16] px-3 py-2 text-sm text-[#F3F4F6] outline-none transition-shadow placeholder:text-[#55606E] focus:border-[#2B7CFF] focus:ring-2 focus:ring-[rgba(43,124,255,.3)]'

export default function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[#C3C9D4]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#55606E]">{hint}</span>}
    </label>
  )
}
