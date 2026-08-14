import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer
  return `scrypt$${salt}$${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, hex] = parts
  const expected = Buffer.from(hex, 'hex')
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}
