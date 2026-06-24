import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { domains } from './domains'

export const nginxRoutes = pgTable('nginx_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id')
    .notNull()
    .references(() => domains.id, { onDelete: 'cascade' }),
  configPath: text('config_path').notNull(),
  isValid: boolean('is_valid').notNull().default(false),
  lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type NginxRoute = typeof nginxRoutes.$inferSelect
export type NewNginxRoute = typeof nginxRoutes.$inferInsert
