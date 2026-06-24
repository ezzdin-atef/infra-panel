import type { FastifyInstance } from 'fastify'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate.js'
import { runBackup, runRestore, deleteBackupFile, computeNextRun } from '../services/backup.js'
import { logActivity } from '../services/audit.js'

const scheduleSchema = z.object({
  name: z.string().min(1),
  serverId: z.string().uuid(),
  databaseId: z.string().uuid(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  retentionCount: z.number().int().min(1).max(90).default(7),
  backupDir: z.string().optional(),
  enabled: z.boolean().default(true),
})

const manualBackupSchema = z.object({
  serverId: z.string().uuid(),
  databaseId: z.string().uuid(),
})

export async function backupsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // -- Schedules ---------------------------------------------------------

  app.get('/schedules', async (_req, reply) => {
    const schedules = await app.db
      .select({
        schedule: schema.backupSchedules,
        dbName: schema.managedDatabases.name,
        serverName: schema.databaseServers.name,
      })
      .from(schema.backupSchedules)
      .leftJoin(schema.managedDatabases, eq(schema.managedDatabases.id, schema.backupSchedules.databaseId))
      .leftJoin(schema.databaseServers, eq(schema.databaseServers.id, schema.backupSchedules.serverId))
    return reply.send(schedules)
  })

  app.post('/schedules', async (req, reply) => {
    const body = scheduleSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    // Set first run to be 1 hour from now
    const firstRun = new Date(Date.now() + 60 * 60 * 1000)

    const [saved] = await app.db.insert(schema.backupSchedules).values({
      ...body.data,
      backupDir: body.data.backupDir ?? null,
      nextRunAt: firstRun,
    }).returning()

    return reply.code(201).send(saved)
  })

  app.put('/schedules/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = scheduleSchema.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed' })

    const update: Record<string, unknown> = { ...body.data, updatedAt: new Date() }
    if (body.data.frequency) {
      update['nextRunAt'] = computeNextRun(body.data.frequency)
    }

    await app.db.update(schema.backupSchedules).set(update).where(eq(schema.backupSchedules.id, id))
    return reply.send({ message: 'Updated' })
  })

  app.delete('/schedules/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await app.db.delete(schema.backupSchedules).where(eq(schema.backupSchedules.id, id))
    return reply.send({ message: 'Deleted' })
  })

  // Trigger manual run from schedule
  app.post('/schedules/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [schedule] = await app.db.select().from(schema.backupSchedules).where(eq(schema.backupSchedules.id, id)).limit(1)
    if (!schedule) return reply.code(404).send({ error: 'Schedule not found' })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, schedule.serverId)).limit(1)
    const [database] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, schedule.databaseId)).limit(1)
    if (!server || !database) return reply.code(404).send({ error: 'Server or database not found' })

    const [run] = await app.db.insert(schema.backupRuns).values({
      scheduleId: id,
      serverId: schedule.serverId,
      databaseId: schedule.databaseId,
      status: 'running',
    }).returning()

    if (!run) return reply.code(500).send({ error: 'Failed to create run record' })

    const actorId = req.user?.sub

    // Run async -- return immediately with run ID
    setImmediate(async () => {
      try {
        const result = await runBackup(server, database, schedule.backupDir ?? undefined)
        await app.db.update(schema.backupRuns).set({
          status: 'success',
          filePath: result.filePath,
          fileSizeBytes: result.fileSizeBytes,
          durationMs: result.durationMs,
          completedAt: new Date(),
        }).where(eq(schema.backupRuns.id, run.id))

        await app.db.update(schema.backupSchedules).set({
          lastRunAt: new Date(),
          nextRunAt: computeNextRun(schedule.frequency),
          updatedAt: new Date(),
        }).where(eq(schema.backupSchedules.id, id))

        void logActivity(app.db, { userId: actorId, action: 'backup.run', resourceType: 'backup', resourceId: run.id, status: 'success', ipAddress: undefined })
      } catch (e) {
        await app.db.update(schema.backupRuns).set({
          status: 'failed',
          errorMessage: e instanceof Error ? e.message : 'Unknown error',
          completedAt: new Date(),
        }).where(eq(schema.backupRuns.id, run.id))
      }
    })

    return reply.code(202).send({ runId: run.id, message: 'Backup started' })
  })

  // -- Runs --------------------------------------------------------------

  app.get('/runs', async (req, reply) => {
    const query = req.query as Record<string, string>
    const databaseId = query['databaseId']

    const runs = await app.db
      .select({
        run: schema.backupRuns,
        dbName: schema.managedDatabases.name,
        serverName: schema.databaseServers.name,
      })
      .from(schema.backupRuns)
      .leftJoin(schema.managedDatabases, eq(schema.managedDatabases.id, schema.backupRuns.databaseId))
      .leftJoin(schema.databaseServers, eq(schema.databaseServers.id, schema.backupRuns.serverId))
      .where(databaseId ? eq(schema.backupRuns.databaseId, databaseId) : undefined)
      .orderBy(desc(schema.backupRuns.startedAt))
      .limit(100)

    return reply.send(runs)
  })

  // Manual backup run
  app.post('/runs', async (req, reply) => {
    const body = manualBackupSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, body.data.serverId)).limit(1)
    const [database] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, body.data.databaseId)).limit(1)
    if (!server || !database) return reply.code(404).send({ error: 'Server or database not found' })

    const [run] = await app.db.insert(schema.backupRuns).values({
      serverId: body.data.serverId,
      databaseId: body.data.databaseId,
      status: 'running',
    }).returning()

    if (!run) return reply.code(500).send({ error: 'Failed to create run record' })

    const manualActorId = req.user?.sub

    setImmediate(async () => {
      try {
        const result = await runBackup(server, database)
        await app.db.update(schema.backupRuns).set({
          status: 'success',
          filePath: result.filePath,
          fileSizeBytes: result.fileSizeBytes,
          durationMs: result.durationMs,
          completedAt: new Date(),
        }).where(eq(schema.backupRuns.id, run.id))

        void logActivity(app.db, { userId: manualActorId, action: 'backup.run', resourceType: 'backup', resourceId: run.id, status: 'success', ipAddress: undefined })
      } catch (e) {
        await app.db.update(schema.backupRuns).set({
          status: 'failed',
          errorMessage: e instanceof Error ? e.message : 'Unknown error',
          completedAt: new Date(),
        }).where(eq(schema.backupRuns.id, run.id))
      }
    })

    return reply.code(202).send({ runId: run.id, message: 'Backup started' })
  })

  app.get('/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [run] = await app.db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, id)).limit(1)
    if (!run) return reply.code(404).send({ error: 'Run not found' })
    return reply.send(run)
  })

  // Restore from a backup run
  app.post('/runs/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [run] = await app.db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, id)).limit(1)
    if (!run) return reply.code(404).send({ error: 'Run not found' })
    if (run.status !== 'success' || !run.filePath) return reply.code(400).send({ error: 'Backup is not in a restorable state' })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, run.serverId)).limit(1)
    const [database] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, run.databaseId)).limit(1)
    if (!server || !database) return reply.code(404).send({ error: 'Server or database not found' })

    try {
      const result = await runRestore(server, database, run.filePath)
      void logActivity(app.db, { userId: req.user?.sub, action: 'backup.restore', resourceType: 'backup', resourceId: id, status: 'success', ipAddress: req.ip })
      return reply.send({ message: 'Restore complete', durationMs: result.durationMs, output: result.output })
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Restore failed' })
    }
  })

  // Delete backup run and its file
  app.delete('/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const [run] = await app.db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, id)).limit(1)
    if (!run) return reply.code(404).send({ error: 'Run not found' })
    if (run.filePath) await deleteBackupFile(run.filePath)
    await app.db.delete(schema.backupRuns).where(eq(schema.backupRuns.id, id))
    return reply.send({ message: 'Deleted' })
  })
}
