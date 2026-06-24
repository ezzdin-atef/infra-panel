import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'

export const databaseServers = pgTable('database_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(5432),
  adminUser: text('admin_user').notNull(),
  adminPasswordEncrypted: text('admin_password_encrypted').notNull(),
  sslMode: text('ssl_mode').notNull().default('prefer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DatabaseServer = typeof databaseServers.$inferSelect
export type NewDatabaseServer = typeof databaseServers.$inferInsert
