import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './applications'
import { managedDatabases } from './managed-databases'
import { databaseUsers } from './database-users'

export const applicationDatabases = pgTable('application_databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  databaseId: uuid('database_id')
    .notNull()
    .references(() => managedDatabases.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .references(() => databaseUsers.id, { onDelete: 'set null' }),
  connectionUrlEncrypted: text('connection_url_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ApplicationDatabase = typeof applicationDatabases.$inferSelect
export type NewApplicationDatabase = typeof applicationDatabases.$inferInsert
