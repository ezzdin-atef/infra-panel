import type { FastifyInstance } from 'fastify'
import { desc, eq, and, gte, lte } from 'drizzle-orm'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate'

export async function auditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req, reply) => {
    const q = req.query as Record<string, string>
    const limit = Math.min(parseInt(q['limit'] ?? '100', 10), 500)
    const action = q['action']
    const resourceType = q['resourceType']
    const since = q['since'] ? new Date(q['since']) : undefined

    const conditions = []
    if (action) conditions.push(eq(schema.activityLogs.action, action))
    if (resourceType) conditions.push(eq(schema.activityLogs.resourceType, resourceType))
    if (since) conditions.push(gte(schema.activityLogs.createdAt, since))

    const logs = await app.db
      .select({
        log: schema.activityLogs,
        userEmail: schema.users.email,
        userName: schema.users.username,
      })
      .from(schema.activityLogs)
      .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(limit)

    return reply.send(logs)
  })

  app.delete('/', async (_req, reply) => {
    // Clear logs older than 90 days
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    await app.db.delete(schema.activityLogs).where(lte(schema.activityLogs.createdAt, cutoff))
    return reply.send({ message: 'Old logs cleared' })
  })
}
