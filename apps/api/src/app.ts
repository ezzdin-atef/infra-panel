import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import { env } from '@repo/config'
import { getDb } from '@repo/database'
import { authRoutes } from './routes/auth'
import { setupRoutes } from './routes/setup'
import { metricsRoutes } from './routes/metrics'
import { dockerRoutes } from './routes/docker'
import { applicationsRoutes } from './routes/applications'
import { domainsRoutes } from './routes/domains'
import { sslRoutes } from './routes/ssl'
import { pgRoutes } from './routes/pg'
import { backupsRoutes } from './routes/backups'
import { firewallRoutes } from './routes/firewall'
import { settingsRoutes } from './routes/settings'
import { auditRoutes } from './routes/audit'
import { startBackupScheduler } from './services/backup-scheduler'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  })

  const db = getDb(env.DATABASE_URL)

  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(fastifyCookie, {
    secret: env.JWT_SECRET,
  })

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.decorate('db', db)

  await app.register(setupRoutes, { prefix: '/api/setup' })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(metricsRoutes, { prefix: '/api/metrics' })
  await app.register(dockerRoutes, { prefix: '/api/docker' })
  await app.register(applicationsRoutes, { prefix: '/api/applications' })
  await app.register(domainsRoutes, { prefix: '/api/domains' })
  await app.register(sslRoutes, { prefix: '/api/ssl' })
  await app.register(pgRoutes, { prefix: '/api/pg' })
  await app.register(backupsRoutes, { prefix: '/api/backups' })
  await app.register(firewallRoutes, { prefix: '/api/firewall' })
  await app.register(settingsRoutes, { prefix: '/api/settings' })
  await app.register(auditRoutes, { prefix: '/api/audit' })

  app.get('/api/health', async () => ({ status: 'ok' }))

  startBackupScheduler(db)

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof getDb>
  }
}
