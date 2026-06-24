import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate'
import {
  checkCertbotAvailable,
  issueCertificate,
  renewCertificate,
  revokeCertificate,
  getDaysUntilExpiry,
} from '../services/certbot'
import { logActivity } from '../services/audit'

const issueSchema = z.object({
  domainId: z.string().uuid(),
  email: z.string().email(),
})

export async function sslRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Certbot health check
  app.get('/health', async (_req, reply) => {
    const status = await checkCertbotAvailable()
    return reply.send(status)
  })

  // List all certificates with expiry info
  app.get('/certificates', async (_req, reply) => {
    const certs = await app.db.select().from(schema.sslCertificates)
    return reply.send(
      certs.map((c) => ({
        ...c,
        daysUntilExpiry: getDaysUntilExpiry(c.expiresAt),
      }))
    )
  })

  // Get one certificate
  app.get('/certificates/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [cert] = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.id, id))
      .limit(1)
    if (!cert) return reply.code(404).send({ error: 'Certificate not found' })
    return reply.send({ ...cert, daysUntilExpiry: getDaysUntilExpiry(cert.expiresAt) })
  })

  // Issue SSL certificate
  app.post('/certificates', async (req, reply) => {
    const body = issueSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    // Verify domain exists
    const [domain] = await app.db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, body.data.domainId))
      .limit(1)
    if (!domain) return reply.code(404).send({ error: 'Domain not found' })

    // Check for existing cert
    const existing = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.domainId, body.data.domainId))
      .limit(1)
    if (existing.length > 0) return reply.code(409).send({ error: 'Certificate already exists for this domain' })

    // Insert pending record
    const [cert] = await app.db
      .insert(schema.sslCertificates)
      .values({
        domainId: body.data.domainId,
        domain: domain.domain,
        status: 'pending',
        certbotEmail: body.data.email,
      })
      .returning()

    if (!cert) return reply.code(500).send({ error: 'Failed to create certificate record' })

    // Run certbot
    const result = await issueCertificate(domain.domain, body.data.email)

    if (!result.success) {
      await app.db
        .update(schema.sslCertificates)
        .set({ status: 'error' as string, updatedAt: new Date() })
        .where(eq(schema.sslCertificates.id, cert.id))
      return reply.code(400).send({ error: 'Certbot failed', output: result.output })
    }

    // Update certificate record
    const now = new Date()
    await app.db.update(schema.sslCertificates).set({
      status: 'active',
      issuedAt: now,
      expiresAt: result.expiresAt ?? null,
      lastRenewedAt: now,
      updatedAt: now,
    }).where(eq(schema.sslCertificates.id, cert.id))

    // Enable SSL on the domain
    await app.db
      .update(schema.domains)
      .set({ sslEnabled: true, updatedAt: new Date() })
      .where(eq(schema.domains.id, domain.id))

    const [updated] = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.id, cert.id))
      .limit(1)

    void logActivity(app.db, { userId: req.user?.sub, action: 'ssl.issue', resourceType: 'ssl', resourceId: String(cert.id), resourceName: body.data.domainId, ipAddress: req.ip })

    return reply.code(201).send({
      certificate: { ...updated, daysUntilExpiry: getDaysUntilExpiry(updated?.expiresAt ?? null) },
      certbotOutput: result.output,
    })
  })

  // Renew certificate
  app.post('/certificates/:id/renew', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [cert] = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.id, id))
      .limit(1)
    if (!cert) return reply.code(404).send({ error: 'Certificate not found' })

    const result = await renewCertificate(cert.domain)

    if (!result.success) {
      return reply.code(400).send({ error: 'Renewal failed', output: result.output })
    }

    const now = new Date()
    await app.db.update(schema.sslCertificates).set({
      status: 'active',
      expiresAt: result.expiresAt ?? cert.expiresAt,
      lastRenewedAt: now,
      updatedAt: now,
    }).where(eq(schema.sslCertificates.id, id))

    const [updated] = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.id, id))
      .limit(1)

    return reply.send({
      certificate: { ...updated, daysUntilExpiry: getDaysUntilExpiry(updated?.expiresAt ?? null) },
      certbotOutput: result.output,
    })
  })

  // Revoke certificate
  app.post('/certificates/:id/revoke', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [cert] = await app.db
      .select()
      .from(schema.sslCertificates)
      .where(eq(schema.sslCertificates.id, id))
      .limit(1)
    if (!cert) return reply.code(404).send({ error: 'Certificate not found' })

    const result = await revokeCertificate(cert.domain)

    await app.db.update(schema.sslCertificates).set({
      status: 'revoked',
      updatedAt: new Date(),
    }).where(eq(schema.sslCertificates.id, id))

    // Disable SSL on domain
    await app.db
      .update(schema.domains)
      .set({ sslEnabled: false, updatedAt: new Date() })
      .where(eq(schema.domains.id, cert.domainId))

    void logActivity(app.db, { userId: req.user?.sub, action: 'ssl.revoke', resourceType: 'ssl', resourceId: id, ipAddress: req.ip })

    return reply.send({ message: 'Revoked', success: result.success, output: result.output })
  })

  // Delete certificate record
  app.delete('/certificates/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await app.db.delete(schema.sslCertificates).where(eq(schema.sslCertificates.id, id))
    return reply.send({ message: 'Deleted' })
  })
}
