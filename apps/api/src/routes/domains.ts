import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate'
import { applyConfig, removeConfig, checkNginxStatus } from '../services/nginx'
import { logActivity } from '../services/audit'

const domainSchema = z.object({
  domain: z.string().min(3).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid domain name'),
  targetType: z.enum(['application', 'container', 'port']),
  targetId: z.string().optional(),
  targetHost: z.string().default('127.0.0.1'),
  targetPort: z.number().int().min(1).max(65535),
})

const updateDomainSchema = domainSchema.partial().extend({
  enabled: z.boolean().optional(),
  sslEnabled: z.boolean().optional(),
})

export async function domainsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Nginx health
  app.get('/nginx/health', async (_req, reply) => {
    const status = await checkNginxStatus()
    return reply.send(status)
  })

  // List domains
  app.get('/', async (_req, reply) => {
    const list = await app.db
      .select({
        domain: schema.domains,
        route: schema.nginxRoutes,
      })
      .from(schema.domains)
      .leftJoin(schema.nginxRoutes, eq(schema.nginxRoutes.domainId, schema.domains.id))
    return reply.send(list)
  })

  // Get one
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row] = await app.db
      .select({ domain: schema.domains, route: schema.nginxRoutes })
      .from(schema.domains)
      .leftJoin(schema.nginxRoutes, eq(schema.nginxRoutes.domainId, schema.domains.id))
      .where(eq(schema.domains.id, id))
      .limit(1)
    if (!row) return reply.code(404).send({ error: 'Domain not found' })
    return reply.send(row)
  })

  // Create domain
  app.post('/', async (req, reply) => {
    const body = domainSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    // Check uniqueness
    const existing = await app.db.select().from(schema.domains).where(eq(schema.domains.domain, body.data.domain)).limit(1)
    if (existing.length > 0) return reply.code(409).send({ error: 'Domain already exists' })

    const [saved] = await app.db.insert(schema.domains).values({
      domain: body.data.domain,
      targetType: body.data.targetType,
      targetId: body.data.targetId ?? null,
      targetHost: body.data.targetHost,
      targetPort: body.data.targetPort,
    }).returning()

    if (!saved) return reply.code(500).send({ error: 'Failed to save domain' })

    void logActivity(app.db, { userId: req.user?.sub, action: 'domain.create', resourceType: 'domain', resourceId: saved.id, resourceName: body.data.domain, ipAddress: req.ip })

    // Write nginx config
    const result = await applyConfig(saved)
    const [route] = await app.db.insert(schema.nginxRoutes).values({
      domainId: saved.id,
      configPath: result.configPath,
      isValid: result.success,
      lastValidatedAt: new Date(),
    }).returning()

    return reply.code(201).send({ domain: saved, route, nginxOutput: result.output })
  })

  // Update domain
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = updateDomainSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [existing] = await app.db.select().from(schema.domains).where(eq(schema.domains.id, id)).limit(1)
    if (!existing) return reply.code(404).send({ error: 'Domain not found' })

    const updated = { ...existing, ...body.data, updatedAt: new Date() }
    const [saved] = await app.db.update(schema.domains).set(updated).where(eq(schema.domains.id, id)).returning()

    if (!saved) return reply.code(500).send({ error: 'Failed to update domain' })

    // Re-apply nginx config
    const result = await applyConfig(saved)
    await app.db.update(schema.nginxRoutes)
      .set({ isValid: result.success, lastValidatedAt: new Date() })
      .where(eq(schema.nginxRoutes.domainId, id))

    return reply.send({ domain: saved, nginxOutput: result.output, nginxValid: result.success })
  })

  // Delete domain
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [existing] = await app.db.select().from(schema.domains).where(eq(schema.domains.id, id)).limit(1)
    if (!existing) return reply.code(404).send({ error: 'Domain not found' })
    await removeConfig(existing.domain)
    await app.db.delete(schema.domains).where(eq(schema.domains.id, id))
    void logActivity(app.db, { userId: req.user?.sub, action: 'domain.delete', resourceType: 'domain', resourceId: id, ipAddress: req.ip })
    return reply.send({ message: 'Domain deleted' })
  })

  // Enable domain
  app.post('/:id/enable', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [existing] = await app.db.select().from(schema.domains).where(eq(schema.domains.id, id)).limit(1)
    if (!existing) return reply.code(404).send({ error: 'Domain not found' })
    const [saved] = await app.db.update(schema.domains).set({ enabled: true, updatedAt: new Date() }).where(eq(schema.domains.id, id)).returning()
    if (!saved) return reply.code(500).send({ error: 'Failed' })
    const result = await applyConfig(saved)
    return reply.send({ message: 'Enabled', nginxValid: result.success, output: result.output })
  })

  // Disable domain
  app.post('/:id/disable', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [existing] = await app.db.select().from(schema.domains).where(eq(schema.domains.id, id)).limit(1)
    if (!existing) return reply.code(404).send({ error: 'Domain not found' })
    await app.db.update(schema.domains).set({ enabled: false, updatedAt: new Date() }).where(eq(schema.domains.id, id))
    await removeConfig(existing.domain)
    return reply.send({ message: 'Disabled' })
  })
}
