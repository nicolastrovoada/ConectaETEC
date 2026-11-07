// Limites de anexo de material de apoio — fonte única no client.
// Espelham `server/src/config.ts` (`maxAttachments`, `maxAttachmentBytes`,
// `ALLOWED_UPLOAD_MIME_TYPES`), que é quem decide: a validação feita aqui só
// evita subir um arquivo que o servidor rejeitaria com 422.
export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_ATTACHMENT_MIME: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])
/** Atributo `accept` do input de arquivo, nos mesmos tipos aceitos. */
export const ACCEPTED_ATTACHMENT_TYPES = "image/jpeg,image/png,image/webp,image/gif,application/pdf"

/** Rótulo dos limites ("até 3 arquivos — imagem ou PDF, máx. 5 MB cada"). */
export function attachmentLimitLabel(): string {
  const mb = MAX_ATTACHMENT_BYTES / (1024 * 1024)
  return `até ${MAX_ATTACHMENTS} arquivos — imagem ou PDF, máx. ${mb} MB cada`
}
