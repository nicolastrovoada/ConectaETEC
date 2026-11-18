import type { AnchorHTMLAttributes, ReactNode } from "react"
import { buttonClasses, type ButtonVariant } from "../ui/Button"

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
  children: ReactNode
}

/** Âncora com a aparência de `Button` (usada em CTAs de navegação da landing). */
export function LinkButton({ variant = "primary", className = "", children, ...props }: LinkButtonProps) {
  return (
    <a className={buttonClasses(variant, className)} {...props}>
      {children}
    </a>
  )
}
