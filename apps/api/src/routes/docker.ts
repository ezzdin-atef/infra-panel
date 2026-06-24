import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getDocker, checkDockerHealth } from '../services/docker'
import { authenticate } from '../middleware/authenticate'
import { logActivity } from '../services/audit'

export async function dockerRoutes(app: FastifyInstance) {
  // All docker routes require authentication
  app.addHook('preHandler', authenticate)

  // Health
  app.get('/health', async (_req, reply) => {
    const result = await checkDockerHealth()
    return reply.code(result.healthy ? 200 : 503).send(result)
  })

  // -- Containers --

  app.get('/containers', async (_req, reply) => {
    const docker = getDocker()
    const containers = await docker.listContainers({ all: true })
    return reply.send(
      containers.map((c) => ({
        id: c.Id,
        names: c.Names.map((n) => n.replace(/^\//, '')),
        image: c.Image,
        imageId: c.ImageID,
        status: c.Status,
        state: c.State,
        created: c.Created,
        ports: c.Ports,
        labels: c.Labels,
      }))
    )
  })

  app.get('/containers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const container = getDocker().getContainer(id)
      const info = await container.inspect()
      return reply.send({
        id: info.Id,
        name: info.Name.replace(/^\//, ''),
        image: info.Config?.Image,
        status: info.State?.Status,
        running: info.State?.Running,
        started: info.State?.StartedAt,
        finished: info.State?.FinishedAt,
        ports: info.NetworkSettings?.Ports,
        mounts: info.Mounts,
        networks: Object.keys(info.NetworkSettings?.Networks ?? {}),
        env: info.Config?.Env,
        labels: info.Config?.Labels,
        restartPolicy: info.HostConfig?.RestartPolicy,
      })
    } catch {
      return reply.code(404).send({ error: 'Container not found' })
    }
  })

  app.get('/containers/:id/stats', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const container = getDocker().getContainer(id)
      const stats = await container.stats({ stream: false }) as unknown as Record<string, unknown>

      const cpuStats = stats['cpu_stats'] as Record<string, unknown>
      const preCpuStats = stats['precpu_stats'] as Record<string, unknown>
      const cpuUsage = cpuStats?.['cpu_usage'] as Record<string, number> | undefined
      const preCpuUsage = preCpuStats?.['cpu_usage'] as Record<string, number> | undefined
      const cpuDelta = (cpuUsage?.['total_usage'] ?? 0) - (preCpuUsage?.['total_usage'] ?? 0)
      const systemDelta =
        ((cpuStats?.['system_cpu_usage'] as number | undefined) ?? 0) -
        ((preCpuStats?.['system_cpu_usage'] as number | undefined) ?? 0)
      const percpuUsage = cpuUsage?.['percpu_usage'] as unknown[] | undefined
      const numCpus = percpuUsage?.length ?? 1
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0

      const memStats = stats['memory_stats'] as Record<string, number>
      const memUsage = memStats?.['usage'] ?? 0
      const memLimit = memStats?.['limit'] ?? 0
      const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0

      return reply.send({
        cpu: Math.round(cpuPercent * 10) / 10,
        memoryUsage: memUsage,
        memoryLimit: memLimit,
        memoryPercent: Math.round(memPercent * 10) / 10,
      })
    } catch {
      return reply.code(404).send({ error: 'Container not found or not running' })
    }
  })

  app.post('/containers/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await getDocker().getContainer(id).start()
      return reply.send({ message: 'Container started' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to start' })
    }
  })

  app.post('/containers/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await getDocker().getContainer(id).stop()
      return reply.send({ message: 'Container stopped' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to stop' })
    }
  })

  app.post('/containers/:id/restart', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await getDocker().getContainer(id).restart()
      void logActivity(app.db, { userId: req.user?.sub, action: 'container.restart', resourceType: 'container', resourceId: id, ipAddress: req.ip })
      return reply.send({ message: 'Container restarted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to restart' })
    }
  })

  app.delete('/containers/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const force = (req.query as Record<string, string>)['force'] === 'true'
    try {
      await getDocker().getContainer(id).remove({ force })
      void logActivity(app.db, { userId: req.user?.sub, action: 'container.delete', resourceType: 'container', resourceId: id, ipAddress: req.ip })
      return reply.send({ message: 'Container deleted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to delete' })
    }
  })

  app.get('/containers/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string }
    const query = req.query as Record<string, string>
    const tail = parseInt(query['tail'] ?? '200', 10)
    const search = query['search'] ?? ''

    try {
      const container = getDocker().getContainer(id)
      const logsBuffer = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      }) as Buffer

      // Strip Docker multiplexing header (8-byte header per chunk)
      let lines: string[] = []
      let offset = 0
      const buf = Buffer.isBuffer(logsBuffer) ? logsBuffer : Buffer.from(logsBuffer)
      while (offset < buf.length) {
        if (offset + 8 > buf.length) break
        const size = buf.readUInt32BE(offset + 4)
        offset += 8
        const line = buf.slice(offset, offset + size).toString('utf8')
        lines.push(...line.split('\n').filter(Boolean))
        offset += size
      }

      if (search) {
        lines = lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
      }

      return reply.send({ lines })
    } catch {
      return reply.code(404).send({ error: 'Container not found' })
    }
  })

  // -- Images --

  app.get('/images', async (_req, reply) => {
    const images = await getDocker().listImages({ all: false })
    return reply.send(
      images.map((img) => ({
        id: img.Id,
        repoTags: img.RepoTags ?? [],
        size: img.Size,
        created: img.Created,
      }))
    )
  })

  const pullSchema = z.object({ image: z.string().min(1) })

  app.post('/images/pull', async (req, reply) => {
    const body = pullSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'image name required' })

    return new Promise((resolve) => {
      getDocker().pull(body.data.image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) {
          resolve(reply.code(400).send({ error: err.message }))
          return
        }
        getDocker().modem.followProgress(stream, (pullErr: Error | null) => {
          if (pullErr) {
            resolve(reply.code(400).send({ error: pullErr.message }))
          } else {
            resolve(reply.send({ message: `Pulled ${body.data.image}` }))
          }
        })
      })
    })
  })

  app.delete('/images/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const force = (req.query as Record<string, string>)['force'] === 'true'
    try {
      await getDocker().getImage(id).remove({ force })
      return reply.send({ message: 'Image deleted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to delete' })
    }
  })

  // -- Networks --

  app.get('/networks', async (_req, reply) => {
    const networks = await getDocker().listNetworks()
    return reply.send(
      networks.map((n) => ({
        id: n.Id,
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        internal: n.Internal,
        created: n.Created,
        containers: Object.keys(n.Containers ?? {}).length,
      }))
    )
  })

  const networkCreateSchema = z.object({
    name: z.string().min(1),
    driver: z.string().default('bridge'),
    internal: z.boolean().default(false),
  })

  app.post('/networks', async (req, reply) => {
    const body = networkCreateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() })
    try {
      const net = await getDocker().createNetwork({
        Name: body.data.name,
        Driver: body.data.driver,
        Internal: body.data.internal,
      })
      return reply.code(201).send({ id: net.id })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to create' })
    }
  })

  app.delete('/networks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      await getDocker().getNetwork(id).remove()
      return reply.send({ message: 'Network deleted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to delete' })
    }
  })

  // -- Volumes --

  app.get('/volumes', async (_req, reply) => {
    const result = await getDocker().listVolumes()
    return reply.send(
      (result.Volumes ?? []).map((v) => ({
        name: v.Name,
        driver: v.Driver,
        mountpoint: v.Mountpoint,
        created: (v as unknown as Record<string, string>)['CreatedAt'],
        labels: v.Labels,
        scope: v.Scope,
      }))
    )
  })

  const volumeCreateSchema = z.object({ name: z.string().min(1), driver: z.string().default('local') })

  app.post('/volumes', async (req, reply) => {
    const body = volumeCreateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid body' })
    try {
      const vol = await getDocker().createVolume({ Name: body.data.name, Driver: body.data.driver })
      return reply.code(201).send({ name: vol.Name })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to create' })
    }
  })

  app.delete('/volumes/:name', async (req, reply) => {
    const { name } = req.params as { name: string }
    const force = (req.query as Record<string, string>)['force'] === 'true'
    try {
      await getDocker().getVolume(name).remove({ force })
      return reply.send({ message: 'Volume deleted' })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to delete' })
    }
  })
}
