import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { Domain } from '@repo/database/schema'

const execAsync = promisify(exec)

export const NGINX_SITES_DIR = process.env['NGINX_SITES_DIR'] ?? '/etc/nginx/sites-available/infra-panel'
export const NGINX_ENABLED_DIR = process.env['NGINX_ENABLED_DIR'] ?? '/etc/nginx/sites-enabled'

export function generateNginxConfig(domain: Domain): string {
  const upstream = `${domain.targetHost}:${domain.targetPort}`

  if (domain.sslEnabled) {
    return `server {
    listen 80;
    server_name ${domain.domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain.domain};

    ssl_certificate /etc/letsencrypt/live/${domain.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain.domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://${upstream};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`
  }

  return `server {
    listen 80;
    server_name ${domain.domain};

    location / {
        proxy_pass http://${upstream};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`
}

export function getConfigPath(domainName: string): string {
  return join(NGINX_SITES_DIR, `${domainName}.conf`)
}

export async function ensureSitesDirExists(): Promise<void> {
  if (!existsSync(NGINX_SITES_DIR)) {
    await mkdir(NGINX_SITES_DIR, { recursive: true })
  }
}

export async function writeConfig(domain: Domain): Promise<string> {
  await ensureSitesDirExists()
  const config = generateNginxConfig(domain)
  const configPath = getConfigPath(domain.domain)
  await writeFile(configPath, config, 'utf8')
  return configPath
}

export async function removeConfig(domainName: string): Promise<void> {
  const configPath = getConfigPath(domainName)
  try { await unlink(configPath) } catch { /* already gone */ }
}

export async function validateNginx(): Promise<{ valid: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('nginx -t 2>&1', { timeout: 10000 })
    const output = stdout + stderr
    return { valid: true, output }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { valid: false, output: (err.stderr ?? err.stdout ?? err.message ?? 'nginx -t failed') }
  }
}

export async function reloadNginx(): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('nginx -s reload', { timeout: 10000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: (err.stderr ?? err.stdout ?? err.message ?? 'reload failed') }
  }
}

export async function applyConfig(domain: Domain): Promise<{ success: boolean; configPath: string; output: string }> {
  const configPath = await writeConfig(domain)
  const validation = await validateNginx()

  if (!validation.valid) {
    // Rollback: remove the config we just wrote
    await removeConfig(domain.domain)
    return { success: false, configPath, output: validation.output }
  }

  const reload = await reloadNginx()
  return { success: reload.success, configPath, output: reload.output }
}

export async function checkNginxStatus(): Promise<{ running: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync('nginx -v 2>&1', { timeout: 5000 })
    const match = stdout.match(/nginx\/(\S+)/)
    return { running: true, version: match?.[1] }
  } catch {
    return { running: false }
  }
}
