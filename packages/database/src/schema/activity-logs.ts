import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'

export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  resourceName: text('resource_name'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  status: text('status').notNull().default('success'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ActivityLog = typeof activityLogs.$inferSelect
export type NewActivityLog = typeof activityLogs.$inferInsert
