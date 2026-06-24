'use server'

import { z } from 'zod'
import type { LoginResponse, SetupStatusResponse } from '@repo/types'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export async function getSetupStatus(): Promise<SetupStatusResponse> {
  const res = await fetch(`${API_URL}/api/setup/status`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to fetch setup status')
  return res.json() as Promise<SetupStatusResponse>
}

export async function loginAction(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; data?: LoginResponse }> {
  const schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  })

  const parsed = schema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: 'Invalid input' }
  }

  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  })

  const data = (await res.json()) as LoginResponse & { error?: string }
  if (!res.ok) return { error: data.error ?? 'Login failed' }
  return { data }
}
