import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface UfwRule {
  to: string
  action: string
  from: string
}

export interface UfwStatus {
  active: boolean
  rules: UfwRule[]
  rawOutput: string
}

export async function getUfwStatus(): Promise<UfwStatus> {
  try {
    const { stdout } = await execAsync('ufw status verbose 2>&1', { timeout: 10000 })
    const active = /Status: active/.test(stdout)
    const rules: UfwRule[] = []

    const lines = stdout.split('\n')
    let inRules = false
    for (const line of lines) {
      if (/^To\s+Action\s+From/.test(line)) { inRules = true; continue }
      if (/^--/.test(line)) continue
      if (!inRules || !line.trim()) continue

      const parts = line.trim().split(/\s{2,}/)
      if (parts.length >= 3) {
        rules.push({
          to: parts[0]?.trim() ?? '',
          action: parts[1]?.trim() ?? '',
          from: parts[2]?.trim() ?? '',
        })
      }
    }
    return { active, rules, rawOutput: stdout }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { active: false, rules: [], rawOutput: err.stdout ?? err.message ?? 'ufw not available' }
  }
}

export function isSSHPort(port: number | string): boolean {
  return String(port) === '22' || String(port).startsWith('22/')
}

export async function allowPort(port: string, protocol: 'tcp' | 'udp' | 'any' = 'tcp'): Promise<{ success: boolean; output: string }> {
  const spec = protocol === 'any' ? port : `${port}/${protocol}`
  try {
    const { stdout, stderr } = await execAsync(`ufw allow ${spec} 2>&1`, { timeout: 15000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'failed' }
  }
}

export async function denyPort(port: string, protocol: 'tcp' | 'udp' | 'any' = 'tcp'): Promise<{ success: boolean; output: string }> {
  const spec = protocol === 'any' ? port : `${port}/${protocol}`
  try {
    const { stdout, stderr } = await execAsync(`ufw deny ${spec} 2>&1`, { timeout: 15000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'failed' }
  }
}

export async function allowIp(ip: string): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(`ufw allow from ${ip} 2>&1`, { timeout: 15000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'failed' }
  }
}

export async function denyIp(ip: string): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(`ufw deny from ${ip} 2>&1`, { timeout: 15000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'failed' }
  }
}

export async function deleteRule(ruleNumber: number): Promise<{ success: boolean; output: string }> {
  try {
    // ufw delete requires "yes" confirmation via stdin
    const { stdout, stderr } = await execAsync(`echo y | ufw delete ${ruleNumber} 2>&1`, { timeout: 15000 })
    return { success: true, output: stdout + stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { success: false, output: err.stderr ?? err.stdout ?? err.message ?? 'failed' }
  }
}
