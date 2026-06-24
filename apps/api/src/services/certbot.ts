import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execAsync = promisify(exec)

export async function checkCertbotAvailable(): Promise<{ available: boolean; version?: string }> {
  try {
    const { stdout } = await execAsync('certbot --version 2>&1', { timeout: 8000 })
    const match = stdout.match(/certbot\s+(\S+)/i)
    return { available: true, version: match?.[1] }
  } catch {
    return { available: false }
  }
}

export async function issueCertificate(
  domain: string,
  email: string
): Promise<{ success: boolean; output: string; expiresAt?: Date }> {
  try {
    const { stdout, stderr } = await execAsync(
      `certbot certonly --nginx -d ${domain} --non-interactive --agree-tos -m ${email} 2>&1`,
      { timeout: 120000 }
    )
    const output = stdout + stderr
    const expiresAt = await readCertExpiry(domain)
    return { success: true, output, expiresAt }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'certbot failed' }
  }
}

export async function renewCertificate(
  domain: string
): Promise<{ success: boolean; output: string; expiresAt?: Date }> {
  try {
    const { stdout, stderr } = await execAsync(
      `certbot renew --cert-name ${domain} --non-interactive 2>&1`,
      { timeout: 120000 }
    )
    const output = stdout + stderr
    const expiresAt = await readCertExpiry(domain)
    return { success: true, output, expiresAt }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'renew failed' }
  }
}

export async function revokeCertificate(
  domain: string
): Promise<{ success: boolean; output: string }> {
  const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`
  try {
    const { stdout, stderr } = await execAsync(
      `certbot revoke --cert-path ${certPath} --non-interactive 2>&1`,
      { timeout: 60000 }
    )
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'revoke failed' }
  }
}

export async function readCertExpiry(domain: string): Promise<Date | undefined> {
  const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`
  if (!existsSync(certPath)) return undefined
  try {
    const { stdout } = await execAsync(
      `openssl x509 -enddate -noout -in ${certPath} 2>&1`,
      { timeout: 8000 }
    )
    // stdout: "notAfter=Jan  1 00:00:00 2026 GMT"
    const match = stdout.match(/notAfter=(.+)/)
    if (!match?.[1]) return undefined
    return new Date(match[1])
  } catch {
    return undefined
  }
}

export function getDaysUntilExpiry(expiresAt: Date | null): number | null {
  if (!expiresAt) return null
  return Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
}
