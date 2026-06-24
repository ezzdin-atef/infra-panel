import { eq, lte, and } from 'drizzle-orm'
import { schema, type Database } from '@repo/database'
import { runBackup, computeNextRun, pruneOldBackups } from './backup.js'

let schedulerInterval: ReturnType<typeof setInterval> | null = null

export function startBackupScheduler(db: Database): void {
  if (schedulerInterval) return

  const tick = async () => {
    try {
      const now = new Date()
      const due = await db
        .select()
        .from(schema.backupSchedules)
        .where(
          and(
            eq(schema.backupSchedules.enabled, true),
            lte(schema.backupSchedules.nextRunAt, now)
          )
        )

      for (const schedule of due) {
        const [server] = await db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, schedule.serverId)).limit(1)
        const [database] = await db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, schedule.databaseId)).limit(1)
        if (!server || !database) continue

        const [run] = await db.insert(schema.backupRuns).values({
          scheduleId: schedule.id,
          serverId: schedule.serverId,
          databaseId: schedule.databaseId,
          status: 'running',
        }).returning()

        if (!run) continue

        try {
          const result = await runBackup(server, database, schedule.backupDir ?? undefined)
          await db.update(schema.backupRuns).set({
            status: 'success',
            filePath: result.filePath,
            fileSizeBytes: result.fileSizeBytes,
            durationMs: result.durationMs,
            completedAt: new Date(),
          }).where(eq(schema.backupRuns.id, run.id))
        } catch (e) {
          await db.update(schema.backupRuns).set({
            status: 'failed',
            errorMessage: e instanceof Error ? e.message : 'Unknown error',
            completedAt: new Date(),
          }).where(eq(schema.backupRuns.id, run.id))
        }

        const nextRunAt = computeNextRun(schedule.frequency)
        await db.update(schema.backupSchedules).set({
          lastRunAt: now,
          nextRunAt,
          updatedAt: new Date(),
        }).where(eq(schema.backupSchedules.id, schedule.id))

        // Prune old backups
        const allRuns = await db
          .select({ id: schema.backupRuns.id, filePath: schema.backupRuns.filePath })
          .from(schema.backupRuns)
          .where(eq(schema.backupRuns.databaseId, schedule.databaseId))
        await pruneOldBackups(allRuns, schedule.retentionCount, async (id) => {
          await db.delete(schema.backupRuns).where(eq(schema.backupRuns.id, id))
        })
      }
    } catch {
      // scheduler errors must not crash the process
    }
  }

  // Check every 60 seconds
  schedulerInterval = setInterval(tick, 60_000)
  // Run once at startup too
  void tick()
}

export function stopBackupScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}
