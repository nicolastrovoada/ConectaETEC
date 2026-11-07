import type { NextFunction, Request, Response } from "express"

/**
 * Envolve handlers síncronos para encaminhar exceções ao error handler
 * central (contrato `{ error, details? }`).
 */
export function handle(
  fn: (req: Request, res: Response) => void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    try {
      fn(req, res)
    } catch (error) {
      next(error)
    }
  }
}

/** Resposta de sucesso padronizada `{ data: ... }`. */
export function sendData(res: Response, status: number, data: unknown): void {
  res.status(status).json({ data })
}