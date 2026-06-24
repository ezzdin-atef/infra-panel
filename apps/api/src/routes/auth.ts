import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createHash } from 'crypto'
import { schema } from '@repo/database'
import { verifyPassword } from '@repo/shared/crypto'
import { signAccessToken, signRefreshToken, verifyToken } from '@repo/shared/jwt'
import { env } from '@repo/config'
import { authenticate } from '../middleware/authenticate'
import { logActivity } from '../services/audit'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getRefreshExpiresAt(): Date {
  const ms = parseDuration(env.JWT_REFRESH_EXPIRES_IN)
  return new Date(Date.now() + ms)
}

function getSessionExpiresAt(): Date {
  const ms = parseDuration(env.JWT_REFRESH_EXPIRES_IN)
  return new Date(Date.now() + ms)
}

function parseDuration(d: string): number {
  const match = d.match(/^(\d+)([smhd])$/)
  if (!match) return 7 * 24 * 60 * 60 * 1000
  const num = parseInt(match[1] ?? '7', 10)
  const unit = match[2]
  const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
  return num * (units[unit ?? 'd'] ?? 86400000)
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request' })
    }

    const { username, password } = body.data
    const [user] = await app.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1)

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const [session] = await app.db
      .insert(schema.sessions)
      .values({
        userId: user.id,
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip,
        expiresAt: getSessionExpiresAt(),
      })
      .returning({ id: schema.sessions.id })

    if (!session) {
      return reply.code(500).send({ error: 'Failed to create session' })
    }

    const payload = { sub: user.id, username: user.username }
    const accessToken = signAccessToken(payload, env.JWT_SECRET, env.JWT_ACCESS_EXPIRES_IN)
    const refreshToken = signRefreshToken(payload, env.JWT_SECRET, env.JWT_REFRESH_EXPIRES_IN)

    await app.db.insert(schema.refreshTokens).values({
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: getRefreshExpiresAt(),
    })

    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60,
    })

    void logActivity(app.db, { userId: user.id, action: 'auth.login', resourceType: 'user', resourceId: user.id, ipAddress: request.ip })

    return reply.send({
      user: { id: user.id, username: user.username, email: user.email },
      accessToken,
    })
  })

  app.post('/logout', { preHandler: [authenticate] }, async (request, reply) => {
    const refreshToken = request.cookies['refresh_token']
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken)
      await app.db
        .update(schema.refreshTokens)
        .set({ isRevoked: true })
        .where(eq(schema.refreshTokens.tokenHash, tokenHash))
    }

    void logActivity(app.db, { userId: request.user?.sub, action: 'auth.logout', resourceType: 'user', resourceId: request.user?.sub, ipAddress: request.ip })
    reply.clearCookie('refresh_token', { path: '/api/auth' })
    return reply.send({ message: 'Logged out' })
  })

  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies['refresh_token']
    if (!refreshToken) {
      return reply.code(401).send({ error: 'No refresh token' })
    }

    let payload
    try {
      payload = verifyToken(refreshToken, env.JWT_SECRET)
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }

    const tokenHash = hashToken(refreshToken)
    const [stored] = await app.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Refresh token revoked or expired' })
    }

    const newAccessToken = signAccessToken(
      { sub: payload.sub, username: payload.username },
      env.JWT_SECRET,
      env.JWT_ACCESS_EXPIRES_IN
    )

    return reply.send({ accessToken: newAccessToken })
  })

  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
    const [user] = await app.db
      .select({
        id: schema.users.id,
        username: schema.users.username,
        email: schema.users.email,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, request.user.sub))
      .limit(1)

    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }
    return reply.send({ user })
  })
}
