const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('access_token')
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error: string }
    throw new Error(err.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}
