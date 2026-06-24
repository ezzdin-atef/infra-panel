import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { managedDatabases } from './managed-databases'
import { databaseUsers } from './database-users'

export const databasePermissions = pgTable('database_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  databaseId: uuid('database_id')
    .notNull()
    .references(() => managedDatabases.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => databaseUsers.id, { onDelete: 'cascade' }),
  permissionType: text('permission_type').notNull(), // readonly | readwrite | full
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DatabasePermission = typeof databasePermissions.$inferSelect
export type NewDatabasePermission = typeof databasePermissions.$inferInsert
