import fs from "node:fs"
import path from "node:path"
import multer from "multer"
import { getDb } from "../db/connection"
import { config, ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES } from "../config"
import { nowBR } from "./dates"
import { badRequest, unprocessable } from "./errors"
import { uuid } from "./uuid"

export function ensureUploadsDir(): void {
  fs.mkdirSync(config.uploadsDir, { recursive: true })
}

export function isAllowedUpload(mimeType: string, originalName: string): boolean {
  const ext = path.extname(originalName).toLowerCase()
  return ALLOWED_UPLOAD_MIME_TYPES.has(mimeType) && ALLOWED_UPLOAD_EXTENSIONS.has(ext)
}

export interface DetectedFileType {
  mimeType: string
  extension: string
  extensions: string[]
}

/**
 * Identifica o tipo REAL do arquivo pelos primeiros bytes (magic bytes).
 * Não confia no mimetype informado pelo cliente nem na extensão do nome.
 */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return { mimeType: "application/pdf", extension: ".pdf", extensions: [".pdf"] }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg", extensions: [".jpg", ".jpeg"] }
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mimeType: "image/png", extension: ".png", extensions: [".png"] }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: ".webp", extensions: [".webp"] }
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("latin1") === "GIF8") {
    return { mimeType: "image/gif", extension: ".gif", extensions: [".gif"] }
  }
  return null
}

/**
 * Valida o conteúdo do arquivo após o multer (magic bytes). Se o conteúdo não
 * bater com a extensão declarada, rejeita 422. Renomeia o arquivo no storage
 * usando a extensão DETECTADA (nunca a do nome original do cliente) e ajusta o
 * mimetype para o valor verificado.
 */
export function normalizeUploadedFile(file: Express.Multer.File): Express.Multer.File {
  const magic = fs.readFileSync(file.path)
  const detected = detectFileType(magic)
  if (!detected) {
    throw unprocessable(
      "Conteúdo do arquivo não é um tipo permitido (JPEG/PNG/WebP/GIF/PDF).",
      "INVALID_FILE_CONTENT",
    )
  }
  const declaredExt = path.extname(file.originalname).toLowerCase()
  if (!detected.extensions.includes(declaredExt)) {
    throw unprocessable(
      "Conteúdo do arquivo não corresponde ao tipo de arquivo declarado.",
      "INVALID_FILE_CONTENT",
    )
  }
  if (path.extname(file.path).toLowerCase() !== detected.extension) {
    const storedName = `${uuid()}${detected.extension}`
    const newPath = path.join(config.uploadsDir, storedName)
    fs.renameSync(file.path, newPath)
    file.path = newPath
    file.filename = storedName
  }
  file.mimetype = detected.mimeType
  return file
}

export function buildStoredName(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase()
  return `${uuid()}${ext}`
}

/** Multer configurado para evidências: imagens (jpeg/png/webp/gif) + PDF, máx. 5 MB, até 3 arquivos. */
export const uploadAttachments = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadsDir()
      cb(null, config.uploadsDir)
    },
    filename: (_req, file, cb) => {
      cb(null, buildStoredName(file.originalname))
    },
  }),
  limits: {
    fileSize: config.maxAttachmentBytes,
    files: config.maxAttachments,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUpload(file.mimetype, file.originalname)) {
      cb(
        unprocessable(
          "Tipo de arquivo não permitido. Envie imagens (JPEG/PNG/WebP/GIF) ou PDF.",
          "UNSUPPORTED_FILE_TYPE",
        ),
      )
      return
    }
    cb(null, true)
  },
})

export interface StoredAttachment {
  id: string
  filename: string
  storedName: string
  mimeType: string
  size: number
  uploadedAt: string
}

/** Insere os metadados dos arquivos enviados vinculados à entrega. */
export function persistAttachments(submissionId: string, files: Express.Multer.File[]): StoredAttachment[] {
  const db = getDb()
  const stored: StoredAttachment[] = []
  const insert = db.prepare(
    `INSERT INTO attachments (id, submissionId, filename, storedName, mimeType, size, uploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const file of files) {
    const attachment: StoredAttachment = {
      id: uuid(),
      filename: file.originalname,
      storedName: path.basename(file.path),
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: nowBR(),
    }
    insert.run(attachment.id, submissionId, attachment.filename, attachment.storedName, attachment.mimeType, attachment.size, attachment.uploadedAt)
    stored.push(attachment)
  }
  return stored
}

/**
 * Metadados de anexo do REFORÇO escolar (3.1) — tabela própria
 * (`study_content_attachments`), então nenhum anexo de entrega aparece na lista de
 * materiais do reforço e nenhum material vira evidência de entrega. Mesmos
 * campos, mesmo par de tipos aceitos e mesmo `mimetype` já verificado por magic
 * bytes por `normalizeUploadedFile`.
 */
export function persistStudyContentAttachments(
  studyContentId: string,
  files: Express.Multer.File[],
): StoredAttachment[] {
  const db = getDb()
  const stored: StoredAttachment[] = []
  const insert = db.prepare(
    `INSERT INTO study_content_attachments
       (id, studyContentId, filename, storedName, mimeType, size, uploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const file of files) {
    const attachment: StoredAttachment = {
      id: uuid(),
      filename: file.originalname,
      storedName: path.basename(file.path),
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: nowBR(),
    }
    insert.run(
      attachment.id,
      studyContentId,
      attachment.filename,
      attachment.storedName,
      attachment.mimeType,
      attachment.size,
      attachment.uploadedAt,
    )
    stored.push(attachment)
  }
  return stored
}

/** Remove arquivos do disco (usado quando a operação falha após o multer). */
export function cleanupUploadedFiles(files: Express.Multer.File[] | undefined): void {
  if (!files) return
  for (const file of files) {
    try {
      fs.unlinkSync(file.path)
    } catch {
      // arquivo já removido/inexistente — ignora
    }
  }
}

/**
 * O nome ainda é referência viva de alguma linha de anexo? O UNIQUE de
 * `storedName` é POR TABELA, então o mesmo nome pode ser anexo de entrega E de
 * reforço ao mesmo tempo — é o estado que o `/uploads` recusa com 404 para todo
 * mundo. Perguntar ao banco é o que impede apagar o byte de um dos dois.
 */
function isStoredNameStillReferenced(storedName: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS found FROM attachments WHERE storedName = ?
       UNION ALL
       SELECT 1 AS found FROM study_content_attachments WHERE storedName = ?
       LIMIT 1`,
    )
    .get(storedName, storedName)
  return row !== undefined
}

/**
 * Apaga do disco os arquivos de nomes já gravados (best-effort por arquivo: um
 * arquivo ausente não derruba a resposta). É o par de `cleanupUploadedFiles` para
 * o caminho feliz: a linha de metadado já saiu do banco (CASCADE, ou o DELETE do
 * anexo antigo no reenvio) e o byte não pode ficar órfão em `uploadsDir` para
 * sempre.
 *
 * Um nome que ainda é referência da OUTRA tabela de anexo é preservado: apagar o
 * reforço não pode levar junto a evidência de uma entrega viva (nem o reenvio
 * pode levar o material de um reforço) — perda de dado irreversível, e o
 * `/uploads` já trata o nome ambíguo como 404 para todo mundo, então o byte
 * guardado não fica acessível a ninguém por acidente.
 */
export function deleteStoredFiles(storedNames: string[]): void {
  for (const storedName of storedNames) {
    if (!validateStoredName(storedName)) continue
    if (isStoredNameStillReferenced(storedName)) continue
    try {
      fs.unlinkSync(path.join(config.uploadsDir, storedName))
    } catch {
      // arquivo ausente/já removido — ignora
    }
  }
}

export function validateStoredName(storedName: string): boolean {
  if (!/^[A-Za-z0-9._-]+$/.test(storedName)) return false
  if (path.basename(storedName) !== storedName) return false
  return true
}

export function assertValidStoredName(storedName: string): void {
  if (!validateStoredName(storedName)) {
    throw badRequest("Nome de arquivo inválido.", "INVALID_STORED_NAME")
  }
}