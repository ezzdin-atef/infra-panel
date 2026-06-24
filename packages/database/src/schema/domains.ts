import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core'

export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  targetType: text('target_type').notNull(), // 'application' | 'container' | 'port'
  targetId: text('target_id'),   // application id or container id
  targetHost: text('target_host').notNull().default('127.0.0.1'),
  targetPort: integer('target_port').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  sslEnabled: boolean('ssl_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Domain = typeof domains.$inferSelect
export type NewDomain = typeof domains.$inferInsert
