import bcrypt from "bcryptjs"
import { config } from "../config"

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, config.bcryptRounds)
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash)
}