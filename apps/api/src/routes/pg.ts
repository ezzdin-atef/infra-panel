import type { FastifyInstance } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { schema } from '@repo/database'
import { authenticate } from '../middleware/authenticate'
import { encrypt, decrypt } from '../lib/crypto'
import { env } from '@repo/config'
import {
  testConnection,
  listPgDatabases,
  getDatabaseStats,
  withPgClient,
  generatePassword,
} from '../services/pg-client'
import { logActivity } from '../services/audit'

const serverSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(5432),
  adminUser: z.string().min(1),
  adminPassword: z.string().min(1),
  sslMode: z.enum(['disable', 'prefer', 'require']).default('prefer'),
})

const createDbSchema = z.object({ name: z.string().min(1).regex(/^[a-z0-9_]+$/) })

const createUserSchema = z.object({
  username: z.string().min(1).regex(/^[a-z0-9_]+$/),
  password: z.string().optional(),
})

const grantSchema = z.object({
  userId: z.string().uuid(),
  permissionType: z.enum(['readonly', 'readwrite', 'full']),
})

const linkSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string().uuid().optional(),
})

export async function pgRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── Servers ───────────────────────────────────────────────────

  app.get('/servers', async (_req, reply) => {
    const servers = await app.db.select({
      id: schema.databaseServers.id,
      name: schema.databaseServers.name,
      host: schema.databaseServers.host,
      port: schema.databaseServers.port,
      adminUser: schema.databaseServers.adminUser,
      sslMode: schema.databaseServers.sslMode,
      createdAt: schema.databaseServers.createdAt,
    }).from(schema.databaseServers)
    return reply.send(servers)
  })

  app.post('/servers', async (req, reply) => {
    const body = serverSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })
    const { adminPassword, ...rest } = body.data
    const [saved] = await app.db.insert(schema.databaseServers).values({
      ...rest,
      adminPasswordEncrypted: encrypt(adminPassword, env.JWT_SECRET),
    }).returning({
      id: schema.databaseServers.id,
      name: schema.databaseServers.name,
      host: schema.databaseServers.host,
      port: schema.databaseServers.port,
      adminUser: schema.databaseServers.adminUser,
      sslMode: schema.databaseServers.sslMode,
    })
    return reply.code(201).send(saved)
  })

  app.put('/servers/:serverId', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const body = serverSchema.partial().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed' })
    const { adminPassword, ...rest } = body.data
    const update: Record<string, unknown> = { ...rest, updatedAt: new Date() }
    if (adminPassword) update['adminPasswordEncrypted'] = encrypt(adminPassword, env.JWT_SECRET)
    await app.db.update(schema.databaseServers).set(update).where(eq(schema.databaseServers.id, serverId))
    return reply.send({ message: 'Updated' })
  })

  app.delete('/servers/:serverId', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    await app.db.delete(schema.databaseServers).where(eq(schema.databaseServers.id, serverId))
    return reply.send({ message: 'Deleted' })
  })

  app.post('/servers/:serverId/test', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    if (!server) return reply.code(404).send({ error: 'Server not found' })
    const result = await testConnection(server)
    return reply.send(result)
  })

  // ── Databases ─────────────────────────────────────────────────

  app.get('/servers/:serverId/databases', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    if (!server) return reply.code(404).send({ error: 'Server not found' })

    const [managed, live] = await Promise.all([
      app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.serverId, serverId)),
      listPgDatabases(server).catch(() => [] as Array<{ name: string; size: string; owner: string }>),
    ])

    const liveMap = new Map(live.map((d) => [d.name, d]))
    return reply.send(managed.map((db) => ({
      ...db,
      liveInfo: liveMap.get(db.name) ?? null,
    })))
  })

  app.post('/servers/:serverId/databases', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const body = createDbSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    if (!server) return reply.code(404).send({ error: 'Server not found' })

    // Create on PG server
    await withPgClient(server, 'postgres', async (sql) => {
      await sql.unsafe(`CREATE DATABASE ${body.data.name}`)
    })

    const [saved] = await app.db.insert(schema.managedDatabases).values({
      serverId,
      name: body.data.name,
    }).returning()

    if (saved) {
      void logActivity(app.db, { userId: req.user?.sub, action: 'database.create', resourceType: 'database', resourceId: saved.id, resourceName: body.data.name, ipAddress: req.ip })
    }

    return reply.code(201).send(saved)
  })

  app.get('/servers/:serverId/databases/:dbId/stats', async (req, reply) => {
    const { serverId, dbId } = req.params as { serverId: string; dbId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [db] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId)).limit(1)
    if (!server || !db) return reply.code(404).send({ error: 'Not found' })
    const stats = await getDatabaseStats(server, db.name)
    return reply.send(stats)
  })

  app.delete('/servers/:serverId/databases/:dbId', async (req, reply) => {
    const { serverId, dbId } = req.params as { serverId: string; dbId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [db] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId)).limit(1)
    if (!server || !db) return reply.code(404).send({ error: 'Not found' })

    // Check for linked applications
    const links = await app.db.select().from(schema.applicationDatabases).where(eq(schema.applicationDatabases.databaseId, dbId))
    if (links.length > 0) return reply.code(409).send({ error: 'Database is linked to applications. Unlink first.' })

    await withPgClient(server, 'postgres', async (sql) => {
      // Terminate existing connections
      await sql.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db.name}' AND pid <> pg_backend_pid()`)
      await sql.unsafe(`DROP DATABASE IF EXISTS ${db.name}`)
    })

    await app.db.delete(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId))
    void logActivity(app.db, { userId: req.user?.sub, action: 'database.delete', resourceType: 'database', resourceId: dbId, ipAddress: req.ip })
    return reply.send({ message: 'Database deleted' })
  })

  // ── Users ─────────────────────────────────────────────────────

  app.get('/servers/:serverId/users', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const users = await app.db.select({
      id: schema.databaseUsers.id,
      serverId: schema.databaseUsers.serverId,
      username: schema.databaseUsers.username,
      createdAt: schema.databaseUsers.createdAt,
    }).from(schema.databaseUsers).where(eq(schema.databaseUsers.serverId, serverId))
    return reply.send(users)
  })

  app.post('/servers/:serverId/users', async (req, reply) => {
    const { serverId } = req.params as { serverId: string }
    const body = createUserSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    if (!server) return reply.code(404).send({ error: 'Server not found' })

    const password = body.data.password ?? generatePassword()
    const { username } = body.data

    await withPgClient(server, 'postgres', async (sql) => {
      await sql.unsafe(`CREATE USER ${username} WITH PASSWORD '${password.replace(/'/g, "''")}'`)
    })

    const [saved] = await app.db.insert(schema.databaseUsers).values({
      serverId,
      username,
      passwordEncrypted: encrypt(password, env.JWT_SECRET),
    }).returning({ id: schema.databaseUsers.id, serverId: schema.databaseUsers.serverId, username: schema.databaseUsers.username, createdAt: schema.databaseUsers.createdAt })

    return reply.code(201).send({ ...saved, generatedPassword: body.data.password ? undefined : password })
  })

  app.put('/servers/:serverId/users/:userId/password', async (req, reply) => {
    const { serverId, userId } = req.params as { serverId: string; userId: string }
    const body = z.object({ password: z.string().optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Invalid' })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [user] = await app.db.select().from(schema.databaseUsers).where(and(eq(schema.databaseUsers.id, userId), eq(schema.databaseUsers.serverId, serverId))).limit(1)
    if (!server || !user) return reply.code(404).send({ error: 'Not found' })

    const newPassword = body.data.password ?? generatePassword()
    await withPgClient(server, 'postgres', async (sql) => {
      await sql.unsafe(`ALTER USER ${user.username} WITH PASSWORD '${newPassword.replace(/'/g, "''")}'`)
    })

    await app.db.update(schema.databaseUsers).set({
      passwordEncrypted: encrypt(newPassword, env.JWT_SECRET),
      updatedAt: new Date(),
    }).where(eq(schema.databaseUsers.id, userId))

    return reply.send({ message: 'Password updated', generatedPassword: body.data.password ? undefined : newPassword })
  })

  app.delete('/servers/:serverId/users/:userId', async (req, reply) => {
    const { serverId, userId } = req.params as { serverId: string; userId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [user] = await app.db.select().from(schema.databaseUsers).where(and(eq(schema.databaseUsers.id, userId), eq(schema.databaseUsers.serverId, serverId))).limit(1)
    if (!server || !user) return reply.code(404).send({ error: 'Not found' })

    await withPgClient(server, 'postgres', async (sql) => {
      await sql.unsafe(`DROP USER IF EXISTS ${user.username}`)
    })
    await app.db.delete(schema.databaseUsers).where(eq(schema.databaseUsers.id, userId))
    return reply.send({ message: 'User deleted' })
  })

  // ── Permissions ───────────────────────────────────────────────

  app.get('/servers/:serverId/databases/:dbId/permissions', async (req, reply) => {
    const { dbId } = req.params as { serverId: string; dbId: string }
    const perms = await app.db
      .select({
        id: schema.databasePermissions.id,
        permissionType: schema.databasePermissions.permissionType,
        createdAt: schema.databasePermissions.createdAt,
        userId: schema.databasePermissions.userId,
        username: schema.databaseUsers.username,
      })
      .from(schema.databasePermissions)
      .leftJoin(schema.databaseUsers, eq(schema.databaseUsers.id, schema.databasePermissions.userId))
      .where(eq(schema.databasePermissions.databaseId, dbId))
    return reply.send(perms)
  })

  app.post('/servers/:serverId/databases/:dbId/permissions', async (req, reply) => {
    const { serverId, dbId } = req.params as { serverId: string; dbId: string }
    const body = grantSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [db] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId)).limit(1)
    const [user] = await app.db.select().from(schema.databaseUsers).where(eq(schema.databaseUsers.id, body.data.userId)).limit(1)
    if (!server || !db || !user) return reply.code(404).send({ error: 'Not found' })

    await withPgClient(server, db.name, async (sql) => {
      // Grant CONNECT on DB
      await sql.unsafe(`GRANT CONNECT ON DATABASE ${db.name} TO ${user.username}`)
      await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${user.username}`)

      if (body.data.permissionType === 'readonly') {
        await sql.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${user.username}`)
        await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${user.username}`)
      } else if (body.data.permissionType === 'readwrite') {
        await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${user.username}`)
        await sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${user.username}`)
        await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${user.username}`)
      } else {
        // full
        await sql.unsafe(`GRANT ALL PRIVILEGES ON DATABASE ${db.name} TO ${user.username}`)
        await sql.unsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${user.username}`)
        await sql.unsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${user.username}`)
      }
    })

    const [saved] = await app.db.insert(schema.databasePermissions).values({
      databaseId: dbId,
      userId: body.data.userId,
      permissionType: body.data.permissionType,
    }).returning()

    return reply.code(201).send(saved)
  })

  app.delete('/servers/:serverId/databases/:dbId/permissions/:permId', async (req, reply) => {
    const { serverId, dbId, permId } = req.params as { serverId: string; dbId: string; permId: string }
    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [db] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId)).limit(1)
    const [perm] = await app.db.select().from(schema.databasePermissions).where(eq(schema.databasePermissions.id, permId)).limit(1)
    const [user] = perm ? await app.db.select().from(schema.databaseUsers).where(eq(schema.databaseUsers.id, perm.userId)).limit(1) : [null]
    if (!server || !db || !perm || !user) return reply.code(404).send({ error: 'Not found' })

    await withPgClient(server, db.name, async (sql) => {
      await sql.unsafe(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${user.username}`)
      await sql.unsafe(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${user.username}`)
      await sql.unsafe(`REVOKE CONNECT ON DATABASE ${db.name} FROM ${user.username}`)
    })

    await app.db.delete(schema.databasePermissions).where(eq(schema.databasePermissions.id, permId))
    return reply.send({ message: 'Permission revoked' })
  })

  // ── App-DB Links ──────────────────────────────────────────────

  app.get('/servers/:serverId/databases/:dbId/links', async (req, reply) => {
    const { dbId } = req.params as { dbId: string }
    const links = await app.db
      .select({
        id: schema.applicationDatabases.id,
        createdAt: schema.applicationDatabases.createdAt,
        applicationId: schema.applicationDatabases.applicationId,
        appName: schema.applications.name,
        userId: schema.applicationDatabases.userId,
        username: schema.databaseUsers.username,
      })
      .from(schema.applicationDatabases)
      .leftJoin(schema.applications, eq(schema.applications.id, schema.applicationDatabases.applicationId))
      .leftJoin(schema.databaseUsers, eq(schema.databaseUsers.id, schema.applicationDatabases.userId))
      .where(eq(schema.applicationDatabases.databaseId, dbId))
    return reply.send(links)
  })

  app.post('/servers/:serverId/databases/:dbId/links', async (req, reply) => {
    const { serverId, dbId } = req.params as { serverId: string; dbId: string }
    const body = linkSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'Validation failed', details: body.error.flatten() })

    const [server] = await app.db.select().from(schema.databaseServers).where(eq(schema.databaseServers.id, serverId)).limit(1)
    const [db] = await app.db.select().from(schema.managedDatabases).where(eq(schema.managedDatabases.id, dbId)).limit(1)
    if (!server || !db) return reply.code(404).send({ error: 'Not found' })

    let connectionUser = server.adminUser
    let connectionPassword = decrypt(server.adminPasswordEncrypted, env.JWT_SECRET)

    if (body.data.userId) {
      const [user] = await app.db.select().from(schema.databaseUsers).where(eq(schema.databaseUsers.id, body.data.userId)).limit(1)
      if (user) {
        connectionUser = user.username
        connectionPassword = decrypt(user.passwordEncrypted, env.JWT_SECRET)
      }
    }

    const connectionUrl = `postgres://${connectionUser}:${encodeURIComponent(connectionPassword)}@${server.host}:${server.port}/${db.name}`

    const [saved] = await app.db.insert(schema.applicationDatabases).values({
      applicationId: body.data.applicationId,
      databaseId: dbId,
      userId: body.data.userId ?? null,
      connectionUrlEncrypted: encrypt(connectionUrl, env.JWT_SECRET),
    }).returning()

    return reply.code(201).send({ ...saved, connectionUrl })
  })

  app.delete('/servers/:serverId/databases/:dbId/links/:linkId', async (req, reply) => {
    const { linkId } = req.params as { serverId: string; dbId: string; linkId: string }
    await app.db.delete(schema.applicationDatabases).where(eq(schema.applicationDatabases.id, linkId))
    return reply.send({ message: 'Unlinked' })
  })
}
