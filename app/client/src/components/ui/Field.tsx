import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

const baseInput =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all disabled:opacity-60"

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  hintId?: string
  error?: string
  children: ReactNode
  required?: boolean
}

/** Campo de formulário com label associado (a11y). */
export function Field({ label, htmlFor, hint, hintId, error, children, required }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = "", ...props }: InputProps) {
  return <input className={`${baseInput} ${className}`} {...props} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
}

export function Select({ className = "", children, ...props }: SelectProps) {
  return (
    <select className={`${baseInput} ${className}`} {...props}>
      {children}
    </select>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className = "", ...props }: TextareaProps) {
  return <textarea className={`${baseInput} ${className}`} {...props} />
}