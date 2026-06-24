import { randomBytes } from 'crypto'
import { decrypt } from '../lib/crypto'
import { env } from '@repo/config'
import type { DatabaseServer } from '@repo/database/schema'

// Minimal interface for the subset of postgres client API we use
interface SqlClient {
  // Tagged template literal
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  unsafe(query: string): Promise<unknown[]>
  end(): Promise<void>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

function createSqlClient(url: string, opts: Record<string, unknown>): SqlClient {
  // Use require so TS doesn't need the 'postgres' module in apps/api's own deps.
  // The package is hoisted by pnpm from packages/database.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const postgres = require('postgres') as AnyFn
  return postgres(url, opts) as SqlClient
}

export function buildConnectionUrl(server: DatabaseServer, password: string, database = 'postgres'): string {
  return `postgres://${server.adminUser}:${encodeURIComponent(password)}@${server.host}:${server.port}/${database}?sslmode=${server.sslMode}`
}

export async function withPgClient<T>(
  server: DatabaseServer,
  database: string,
  fn: (sql: SqlClient) => Promise<T>
): Promise<T> {
  const password = decrypt(server.adminPasswordEncrypted, env.JWT_SECRET)
  const sql = createSqlClient(buildConnectionUrl(server, password, database), {
    connect_timeout: 10,
    max: 1,
  })
  try {
    return await fn(sql)
  } finally {
    await sql.end()
  }
}

export async function testConnection(server: DatabaseServer): Promise<{ success: boolean; error?: string }> {
  try {
    await withPgClient(server, 'postgres', async (sql) => {
      await sql`SELECT 1`
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Connection failed' }
  }
}

export async function listPgDatabases(server: DatabaseServer): Promise<Array<{ name: string; size: string; owner: string }>> {
  return withPgClient(server, 'postgres', async (sql) => {
    const rows = await sql`
      SELECT d.datname,
             pg_size_pretty(pg_database_size(d.datname)) AS size,
             r.rolname AS owner
      FROM pg_database d
      JOIN pg_roles r ON r.oid = d.datdba
      WHERE d.datistemplate = false
      ORDER BY d.datname
    ` as Array<{ datname: string; size: string; owner: string }>
    return rows.map((r) => ({ name: r.datname, size: r.size, owner: r.owner }))
  })
}

export async function getDatabaseStats(server: DatabaseServer, dbName: string): Promise<Record<string, unknown>> {
  return withPgClient(server, dbName, async (sql) => {
    const sizeRows = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size` as Array<{ size: string }>
    const connRows = await sql`SELECT count(*) AS count FROM pg_stat_activity WHERE datname = current_database()` as Array<{ count: string }>
    const tableRows = await sql`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'` as Array<{ count: string }>
    return {
      size: sizeRows[0]?.size ?? '0 bytes',
      connections: parseInt(connRows[0]?.count ?? '0', 10),
      tables: parseInt(tableRows[0]?.count ?? '0', 10),
    }
  })
}

export function generatePassword(length = 24): string {
  return randomBytes(length).toString('base64url').slice(0, length)
}
