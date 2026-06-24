import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { domains } from './domains'

export const sslCertificates = pgTable('ssl_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id')
    .notNull()
    .references(() => domains.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull(),
  status: text('status').notNull().default('pending'), // pending | active | expired | revoked
  certbotEmail: text('certbot_email'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastRenewedAt: timestamp('last_renewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type SslCertificate = typeof sslCertificates.$inferSelect
export type NewSslCertificate = typeof sslCertificates.$inferInsert
