import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'infra-panel-salt', 32)
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret)
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, 16)
  const tag = buf.subarray(16, 32)
  const encrypted = buf.subarray(32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
