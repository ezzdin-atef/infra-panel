import jwt from 'jsonwebtoken'
import type { JwtPayload } from '@repo/types'

export function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string
): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions)
}

export function signRefreshToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string
): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload
}
