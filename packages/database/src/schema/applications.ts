import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  image: text('image').notNull(),
  containerId: text('container_id'),
  containerName: text('container_name'),
  ports: jsonb('ports').$type<Array<{ host: number; container: number; protocol: string }>>().default([]),
  status: text('status').notNull().default('stopped'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
