import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate.js'
import { verifyPassword, hashPassword } from '@repo/shared/crypto'

const execAsync = promisify(exec)

const DEFAULT_SETTINGS: Record<string, string> = {
  server_name: 'My Server',
  timezone: 'UTC',
  backup_dir: '/var/backups/infra-panel',
  panel_domain: '',
  session_timeout_minutes: '1440',
}

async function getSettings(db: FastifyInstance['db']): Promise<Record<string, string>> {
  const rows = await db.select().from(schema.settings)
  const map: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    if (row.value !== null) map[row.key] = row.value
  }
  return map
}

async function setSetting(db: FastifyInstance['db'], key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })
}

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── General settings ──────────────────────────────────────────

  app.get('/', async (_req, reply) => {
    const all = await getSettings(app.db)
    return reply.send(all)
  })

  const generalSchema = z.object({
    server_name: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    backup_dir: z.string().min(1).optional(),
    panel_domain: z.string().optional(),
    session_timeout_minutes: z.coerce.number().int().min(5).max(43200).optional(),
  })

  app.put('/', async (req, reply) => {
    const body = generalSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const updates = body.data
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) await setSetting(app.db, k, String(v))
    }
    return reply.send({ message: 'Settings saved' })
  })

  // ── Change password ───────────────────────────────────────────

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  })

  app.post('/change-password', async (req, reply) => {
    const user = req.user!
    const body = changePasswordSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [dbUser] = await app.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.sub))
      .limit(1)

    if (!dbUser) return reply.code(404).send({ error: 'User not found' })

    const valid = await verifyPassword(body.data.currentPassword, dbUser.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' })

    const hash = await hashPassword(body.data.newPassword)
    await app.db
      .update(schema.users)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.sub))

    return reply.send({ message: 'Password changed' })
  })

  // ── Login history (sessions) ──────────────────────────────────

  app.get('/sessions', async (req, reply) => {
    const user = req.user!
    const rows = await app.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.sub))
    return reply.send(rows)
  })

  app.delete('/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await app.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, id))
    return reply.send({ message: 'Session revoked' })
  })

  // ── System checks ─────────────────────────────────────────────

  interface CheckResult { name: string; status: 'ok' | 'error'; version?: string; message?: string }

  async function check(name: string, cmd: string, parse?: (out: string) => string): Promise<CheckResult> {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 8000 })
      return { name, status: 'ok', version: parse ? parse(stdout.trim()) : stdout.trim().split('\n')[0] }
    } catch (e) {
      return { name, status: 'error', message: e instanceof Error ? e.message : 'Not available' }
    }
  }

  app.get('/system-checks', async (_req, reply) => {
    const results = await Promise.all([
      check('Docker', 'docker --version', (o) => o.replace('Docker version ', '')),
      check('Docker Compose', 'docker compose version', (o) => o.replace('Docker Compose version ', '')),
      check('Nginx', 'nginx -v 2>&1', (o) => o.replace('nginx version: nginx/', '')),
      check('PostgreSQL (client)', 'psql --version', (o) => o.replace('psql (PostgreSQL) ', '')),
      check('Certbot', 'certbot --version', (o) => o),
      check('UFW', 'ufw --version', (o) => o.split('\n')[0] ?? o),
    ])
    return reply.send(results)
  })
}
