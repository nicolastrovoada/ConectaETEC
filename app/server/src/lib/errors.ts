/** Erros de aplicação com código HTTP padronizado. */
export class AppError extends Error {
  readonly status: number
  readonly details?: string

  constructor(status: number, message: string, details?: string) {
    super(message)
    this.name = "AppError"
    this.status = status
    this.details = details
  }
}

export function badRequest(message: string, details?: string): AppError {
  return new AppError(400, message, details)
}

export function unauthorized(message = "Não autenticado.", details?: string): AppError {
  return new AppError(401, message, details)
}

export function forbidden(message = "Sem permissão para esta ação.", details?: string): AppError {
  return new AppError(403, message, details)
}

export function notFound(message = "Recurso não encontrado.", details?: string): AppError {
  return new AppError(404, message, details)
}

export function conflict(message: string, details?: string): AppError {
  return new AppError(409, message, details)
}

export function unprocessable(message: string, details?: string): AppError {
  return new AppError(422, message, details)
}

export function tooMany(message: string, details?: string): AppError {
  return new AppError(429, message, details)
}