import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { getDocker } from '../services/docker'
import { authenticate } from '../middleware/authenticate'
import { encrypt } from '../lib/crypto'
import { env } from '@repo/config'

const createAppSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, hyphens, underscores'),
  image: z.string().min(1),
  ports: z.array(z.object({
    host: z.number().int().min(1).max(65535),
    container: z.number().int().min(1).max(65535),
    protocol: z.enum(['tcp', 'udp']).default('tcp'),
  })).default([]),
  envVars: z.array(z.object({
    key: z.string().min(1).regex(/^[A-Z0-9_]+$/),
    value: z.string(),
    isSecret: z.boolean().default(false),
  })).default([]),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).default('unless-stopped'),
})

const envVarSchema = z.object({
  key: z.string().min(1).regex(/^[A-Z0-9_]+$/),
  value: z.string(),
  isSecret: z.boolean().default(false),
})

export async function applicationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // List
  app.get('/', async (_req, reply) => {
    const apps = await app.db.select().from(schema.applications)
    return reply.send(apps)
  })

  // Get one
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_) return reply.code(404).send({ error: 'Application not found' })
    return reply.send(app_)
  })

  // Create
  app.post('/', async (req, reply) => {
    const body = createAppSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const { name, image, ports, envVars, restartPolicy } = body.data

    // Check name uniqueness
    const existing = await app.db.select().from(schema.applications).where(eq(schema.applications.name, name)).limit(1)
    if (existing.length > 0) return reply.code(409).send({ error: 'Application name already in use' })

    const docker = getDocker()

    // Pull image
    try {
      await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err)
          docker.modem.followProgress(stream, (pullErr: Error | null) => {
            if (pullErr) reject(pullErr)
            else resolve()
          })
        })
      })
    } catch (e) {
      return reply.code(400).send({ error: `Failed to pull image: ${e instanceof Error ? e.message : 'unknown'}` })
    }

    // Build port bindings
    const exposedPorts: Record<string, object> = {}
    const portBindings: Record<string, Array<{ HostPort: string }>> = {}
    for (const p of ports) {
      const key = `${p.container}/${p.protocol}`
      exposedPorts[key] = {}
      portBindings[key] = [{ HostPort: String(p.host) }]
    }

    // Build env array
    const dockerEnv: string[] = envVars.map((e) => `${e.key}=${e.value}`)

    // Create container
    let container
    try {
      container = await docker.createContainer({
        name: `infra_${name}`,
        Image: image,
        Env: dockerEnv,
        ExposedPorts: exposedPorts,
        HostConfig: {
          PortBindings: portBindings,
          RestartPolicy: { Name: restartPolicy },
        },
      })
    } catch (e) {
      return reply.code(400).send({ error: `Failed to create container: ${e instanceof Error ? e.message : 'unknown'}` })
    }

    // Start container
    try {
      await container.start()
    } catch (e) {
      await container.remove({ force: true }).catch(() => null)
      return reply.code(400).send({ error: `Failed to start container: ${e instanceof Error ? e.message : 'unknown'}` })
    }

    // Save to DB
    const [saved] = await app.db.insert(schema.applications).values({
      name,
      image,
      containerId: container.id,
      containerName: `infra_${name}`,
      ports: ports,
      status: 'running',
    }).returning()

    if (!saved) return reply.code(500).send({ error: 'Failed to save application' })

    // Save env vars
    if (envVars.length > 0) {
      await app.db.insert(schema.applicationEnvs).values(
        envVars.map((e) => ({
          applicationId: saved.id,
          key: e.key,
          value: e.isSecret ? encrypt(e.value, env.JWT_SECRET) : e.value,
          isSecret: e.isSecret,
        }))
      )
    }

    return reply.code(201).send(saved)
  })

  // Start
  app.post('/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_) return reply.code(404).send({ error: 'Not found' })
    if (!app_.containerId) return reply.code(400).send({ error: 'No container associated' })
    try {
      await getDocker().getContainer(app_.containerId).start()
      await app.db.update(schema.applications).set({ status: 'running', updatedAt: new Date() }).where(eq(schema.applications.id, id))
      return reply.send({ message: 'Started' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to start' })
    }
  })

  // Stop
  app.post('/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_) return reply.code(404).send({ error: 'Not found' })
    if (!app_.containerId) return reply.code(400).send({ error: 'No container associated' })
    try {
      await getDocker().getContainer(app_.containerId).stop()
      await app.db.update(schema.applications).set({ status: 'stopped', updatedAt: new Date() }).where(eq(schema.applications.id, id))
      return reply.send({ message: 'Stopped' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to stop' })
    }
  })

  // Restart
  app.post('/:id/restart', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_) return reply.code(404).send({ error: 'Not found' })
    if (!app_.containerId) return reply.code(400).send({ error: 'No container associated' })
    try {
      await getDocker().getContainer(app_.containerId).restart()
      await app.db.update(schema.applications).set({ status: 'running', updatedAt: new Date() }).where(eq(schema.applications.id, id))
      return reply.send({ message: 'Restarted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to restart' })
    }
  })

  // Delete
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_) return reply.code(404).send({ error: 'Not found' })
    if (app_.containerId) {
      try {
        await getDocker().getContainer(app_.containerId).remove({ force: true })
      } catch { /* container may already be gone */ }
    }
    await app.db.delete(schema.applications).where(eq(schema.applications.id, id))
    return reply.send({ message: 'Deleted' })
  })

  // Logs
  app.get('/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string }
    const query = req.query as Record<string, string>
    const tail = parseInt(query['tail'] ?? '200', 10)
    const [app_] = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (!app_ || !app_.containerId) return reply.code(404).send({ error: 'Not found' })
    try {
      const logsBuffer = await getDocker().getContainer(app_.containerId).logs({
        stdout: true, stderr: true, tail, timestamps: true,
      }) as Buffer
      let lines: string[] = []
      let offset = 0
      const buf = Buffer.isBuffer(logsBuffer) ? logsBuffer : Buffer.from(logsBuffer as unknown as string)
      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const size = buf.readUInt32BE(offset + 4)
        offset += 8
        const line = buf.subarray(offset, offset + size).toString('utf8')
        lines.push(...line.split('\n').filter(Boolean))
        offset += size
      }
      return reply.send({ lines })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to get logs' })
    }
  })

  // List env vars (mask secrets)
  app.get('/:id/env', async (req, reply) => {
    const { id } = req.params as { id: string }
    const vars = await app.db.select().from(schema.applicationEnvs).where(eq(schema.applicationEnvs.applicationId, id))
    return reply.send(vars.map((v) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? '........' : v.value,
      isSecret: v.isSecret,
      createdAt: v.createdAt,
    })))
  })

  // Add env var
  app.post('/:id/env', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = envVarSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })
    const app_ = await app.db.select().from(schema.applications).where(eq(schema.applications.id, id)).limit(1)
    if (app_.length === 0) return reply.code(404).send({ error: 'Not found' })
    const [saved] = await app.db.insert(schema.applicationEnvs).values({
      applicationId: id,
      key: body.data.key,
      value: body.data.isSecret ? encrypt(body.data.value, env.JWT_SECRET) : body.data.value,
      isSecret: body.data.isSecret,
    }).returning()
    return reply.code(201).send({ ...saved, value: body.data.isSecret ? '........' : saved?.value })
  })

  // Update env var
  app.put('/:id/env/:envId', async (req, reply) => {
    const { id, envId } = req.params as { id: string; envId: string }
    const body = envVarSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed' })
    const [updated] = await app.db.update(schema.applicationEnvs)
      .set({
        key: body.data.key,
        value: body.data.isSecret ? encrypt(body.data.value, env.JWT_SECRET) : body.data.value,
        isSecret: body.data.isSecret,
      })
      .where(and(eq(schema.applicationEnvs.id, envId), eq(schema.applicationEnvs.applicationId, id)))
      .returning()
    if (!updated) return reply.code(404).send({ error: 'Env var not found' })
    return reply.send({ ...updated, value: body.data.isSecret ? '........' : updated.value })
  })

  // Delete env var
  app.delete('/:id/env/:envId', async (req, reply) => {
    const { id, envId } = req.params as { id: string; envId: string }
    await app.db.delete(schema.applicationEnvs)
      .where(and(eq(schema.applicationEnvs.id, envId), eq(schema.applicationEnvs.applicationId, id)))
    return reply.send({ message: 'Deleted' })
  })
}
