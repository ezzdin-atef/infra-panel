import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core'
import { managedDatabases } from './managed-databases'
import { databaseServers } from './database-servers'

export const backupSchedules = pgTable('backup_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  serverId: uuid('server_id').notNull().references(() => databaseServers.id, { onDelete: 'cascade' }),
  databaseId: uuid('database_id').notNull().references(() => managedDatabases.id, { onDelete: 'cascade' }),
  frequency: text('frequency').notNull(), // daily | weekly | monthly
  retentionCount: integer('retention_count').notNull().default(7),
  backupDir: text('backup_dir'),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type BackupSchedule = typeof backupSchedules.$inferSelect
export type NewBackupSchedule = typeof backupSchedules.$inferInsert
