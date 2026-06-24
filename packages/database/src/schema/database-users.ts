import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { databaseServers } from './database-servers'

export const databaseUsers = pgTable('database_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => databaseServers.id, { onDelete: 'cascade' }),
  username: text('username').notNull(),
  passwordEncrypted: text('password_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DatabaseUser = typeof databaseUsers.$inferSelect
export type NewDatabaseUser = typeof databaseUsers.$inferInsert
