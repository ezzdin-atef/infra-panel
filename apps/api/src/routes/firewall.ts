import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../middleware/authenticate.js'
import { getUfwStatus, allowPort, denyPort, allowIp, denyIp, deleteRule, isSSHPort } from '../services/ufw.js'
import { logActivity } from '../services/audit.js'

const portRuleSchema = z.object({
  port: z.union([z.string().min(1), z.number().int().min(1).max(65535).transform(String)]),
  protocol: z.enum(['tcp', 'udp', 'any']).default('tcp'),
  action: z.enum(['allow', 'deny']),
})

const ipRuleSchema = z.object({
  ip: z.string().min(7),
  action: z.enum(['allow', 'deny']),
})

export async function firewallRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/status', async (_req, reply) => {
    const status = await getUfwStatus()
    return reply.send(status)
  })

  app.post('/port', async (req, reply) => {
    const body = portRuleSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    // Protect SSH
    if (body.data.action === 'deny' && isSSHPort(body.data.port)) {
      return reply.code(400).send({ error: 'Cannot deny port 22 -- this would lock you out via SSH.' })
    }

    const result = body.data.action === 'allow'
      ? await allowPort(body.data.port, body.data.protocol)
      : await denyPort(body.data.port, body.data.protocol)

    void logActivity(app.db, { userId: req.user?.sub, action: 'firewall.port', resourceType: 'firewall', metadata: { port: body.data.port, protocol: body.data.protocol, action: body.data.action }, ipAddress: req.ip, status: result.success ? 'success' : 'error' })

    return reply.code(result.success ? 200 : 400).send(result)
  })

  app.post('/ip', async (req, reply) => {
    const body = ipRuleSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const result = body.data.action === 'allow'
      ? await allowIp(body.data.ip)
      : await denyIp(body.data.ip)

    void logActivity(app.db, { userId: req.user?.sub, action: 'firewall.ip', resourceType: 'firewall', metadata: { ip: body.data.ip, action: body.data.action }, ipAddress: req.ip, status: result.success ? 'success' : 'error' })

    return reply.code(result.success ? 200 : 400).send(result)
  })

  app.delete('/rules/:number', async (req, reply) => {
    const { number } = req.params as { number: string }
    const ruleNumber = parseInt(number, 10)
    if (isNaN(ruleNumber) || ruleNumber < 1) return reply.code(400).send({ error: 'Invalid rule number' })

    const result = await deleteRule(ruleNumber)
    void logActivity(app.db, { userId: req.user?.sub, action: 'firewall.rule.delete', resourceType: 'firewall', metadata: { ruleNumber }, ipAddress: req.ip, status: result.success ? 'success' : 'error' })
    return reply.code(result.success ? 200 : 400).send(result)
  })
}
