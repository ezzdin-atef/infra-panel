import { exec } from 'child_process'
import { promisify } from 'util'
import { mkdir, stat, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { decrypt } from '../lib/crypto.js'
import { env } from '@repo/config'
import type { DatabaseServer, ManagedDatabase } from '@repo/database/schema'

const execAsync = promisify(exec)

export function computeNextRun(frequency: string, from = new Date()): Date {
  const next = new Date(from)
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}

export async function ensureBackupDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

export async function runBackup(
  server: DatabaseServer,
  database: ManagedDatabase,
  outputDir?: string
): Promise<{ filePath: string; fileSizeBytes: number; durationMs: number }> {
  const dir = outputDir ?? env.BACKUP_DIR
  await ensureBackupDir(dir)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${database.name}_${timestamp}.dump`
  const filePath = join(dir, filename)

  const password = decrypt(server.adminPasswordEncrypted, env.JWT_SECRET)
  const connStr = `postgres://${server.adminUser}:${encodeURIComponent(password)}@${server.host}:${server.port}/${database.name}`

  const start = Date.now()
  await execAsync(
    `pg_dump --format=custom --no-password "${connStr}" --file="${filePath}"`,
    { timeout: 600000, env: { ...process.env, PGPASSWORD: password } }
  )
  const durationMs = Date.now() - start

  const info = await stat(filePath)
  return { filePath, fileSizeBytes: info.size, durationMs }
}

export async function runRestore(
  server: DatabaseServer,
  database: ManagedDatabase,
  filePath: string
): Promise<{ durationMs: number; output: string }> {
  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`)
  }

  const password = decrypt(server.adminPasswordEncrypted, env.JWT_SECRET)
  const connStr = `postgres://${server.adminUser}:${encodeURIComponent(password)}@${server.host}:${server.port}/${database.name}`

  const start = Date.now()
  const { stdout, stderr } = await execAsync(
    `pg_restore --clean --if-exists --no-password -d "${connStr}" "${filePath}"`,
    { timeout: 600000, env: { ...process.env, PGPASSWORD: password } }
  )
  return { durationMs: Date.now() - start, output: stdout + stderr }
}

export async function deleteBackupFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch {
    // file may already be gone
  }
}

export async function pruneOldBackups(
  runs: Array<{ id: string; filePath: string | null }>,
  retentionCount: number,
  deleteFromDb: (id: string) => Promise<void>
): Promise<string[]> {
  const toDelete = runs.slice(retentionCount)
  const deleted: string[] = []
  for (const run of toDelete) {
    if (run.filePath) await deleteBackupFile(run.filePath)
    await deleteFromDb(run.id)
    deleted.push(run.id)
  }
  return deleted
}
