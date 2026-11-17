import type { ButtonHTMLAttributes } from "react"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "onDark" | "onDarkOutline"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blue-700 hover:bg-blue-800 text-white shadow-sm",
  secondary:
    "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700",
  ghost: "text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800",
  danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm",
  success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
  onDark: "bg-white text-[#0d2d6b] hover:bg-blue-50 shadow-sm focus-visible:outline-white",
  onDarkOutline: "border border-white/40 text-white hover:bg-white/10 focus-visible:outline-white",
}

/** Classes compartilhadas por `Button` e `LinkButton` (mesma aparência, elementos diferentes). */
export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 ${VARIANTS[variant]} ${className}`
}

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />
}
