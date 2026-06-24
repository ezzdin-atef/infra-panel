import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '@repo/shared/jwt'
import { env } from '@repo/config'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }

  try {
    const payload = verifyToken(token, env.JWT_SECRET)
    request.user = payload
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' })
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: import('@repo/types').JwtPayload
  }
}
