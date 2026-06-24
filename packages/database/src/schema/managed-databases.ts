import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { databaseServers } from './database-servers'

export const managedDatabases = pgTable('managed_databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => databaseServers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  owner: text('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ManagedDatabase = typeof managedDatabases.$inferSelect
export type NewManagedDatabase = typeof managedDatabases.$inferInsert
