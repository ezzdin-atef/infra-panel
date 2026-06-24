import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { hashPassword, validatePasswordStrength } from '@repo/shared/crypto'

const setupSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function setupRoutes(app: FastifyInstance) {
  app.get('/status', async () => {
    const result = await app.db.select().from(schema.users).limit(1)
    return { isSetup: result.length > 0 }
  })

  app.post('/complete', async (request, reply) => {
    const existing = await app.db.select().from(schema.users).limit(1)
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Setup already completed' })
    }

    const body = setupSchema.safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })
    }

    const { username, email, password } = body.data
    const strength = validatePasswordStrength(password)
    if (!strength.valid) {
      return reply.code(400).send({ error: strength.message })
    }

    const passwordHash = await hashPassword(password)
    const [user] = await app.db
      .insert(schema.users)
      .values({ username, email, passwordHash })
      .returning({ id: schema.users.id, username: schema.users.username, email: schema.users.email })

    return reply.code(201).send({ user })
  })
}
