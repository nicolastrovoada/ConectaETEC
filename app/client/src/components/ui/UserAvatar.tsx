import type { SafeUser } from "@shared/types"

interface UserAvatarProps {
  /** Usuário cujo `avatar` é uma URL de foto (`/uploads/...`) ou a letra de fallback. */
  user: Pick<SafeUser, "avatar" | "name">
  /** Classes do container: tamanho, gradiente por papel e arredondamento. */
  className?: string
  /** Classes da letra de fallback (tamanho/peso da fonte). */
  textClassName?: string
}

/**
 * Avatar do usuário com dois estados: foto enviada ou letra de fallback.
 *
 * A API sempre devolveu `avatar` como texto; desde a foto de perfil o campo
 * passou a poder ser uma URL (`/uploads/avatars/...`). Renderizar o valor cru
 * mostraria a URL inteira na tela — por isso este componente é o único ponto que
 * decide entre `<img>` e letra. A imagem é same-origin, então o cookie httpOnly
 * da sessão acompanha o pedido e a rota protegida de avatares responde.
 *
 * `aria-hidden` é seguro: o nome do usuário aparece sempre ao lado do avatar e
 * a foto é decorativa (alt vazio).
 */
export function UserAvatar({ user, className = "", textClassName = "" }: UserAvatarProps) {
  const hasPhoto = user.avatar.startsWith("/uploads/")

  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      {hasPhoto ? (
        <img src={user.avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={textClassName}>{user.avatar}</span>
      )}
    </div>
  )
}
