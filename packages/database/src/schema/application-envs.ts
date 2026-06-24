import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { applications } from './applications'

export const applicationEnvs = pgTable('application_envs', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  isSecret: boolean('is_secret').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ApplicationEnv = typeof applicationEnvs.$inferSelect
export type NewApplicationEnv = typeof applicationEnvs.$inferInsert
