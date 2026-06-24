import { pgTable, text, timestamp, uuid, integer, bigint } from 'drizzle-orm/pg-core'
import { managedDatabases } from './managed-databases'
import { databaseServers } from './database-servers'
import { backupSchedules } from './backup-schedules'

export const backupRuns = pgTable('backup_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').references(() => backupSchedules.id, { onDelete: 'set null' }),
  serverId: uuid('server_id').notNull().references(() => databaseServers.id, { onDelete: 'cascade' }),
  databaseId: uuid('database_id').notNull().references(() => managedDatabases.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'), // running | success | failed
  filePath: text('file_path'),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  durationMs: integer('duration_ms'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BackupRun = typeof backupRuns.$inferSelect
export type NewBackupRun = typeof backupRuns.$inferInsert
