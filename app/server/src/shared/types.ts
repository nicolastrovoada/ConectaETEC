// Seam entre o servidor e o contrato compartilhado do monorepo.
// Não duplica o contrato: re-exporta `app/shared/types.ts` (fonte única).
export * from "../../../shared/types"