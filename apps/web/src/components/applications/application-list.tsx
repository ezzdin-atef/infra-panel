'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface Application {
  id: string
  name: string
  image: string
  containerId: string | null
  status: string
  ports: Array<{ host: number; container: number; protocol: string }>
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-900 text-green-300 border-green-700',
    stopped: 'bg-gray-800 text-gray-400 border-gray-600',
    error: 'bg-red-900 text-red-300 border-red-700',
  }
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${map[status] ?? map['stopped']}`}>
      {status}
    </span>
  )
}

export function ApplicationList() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchApps = useCallback(async () => {
    try {
      const data = await apiFetch<Application[]>('/api/applications')
      setApps(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApps()
    const id = setInterval(fetchApps, 10000)
    return () => clearInterval(id)
  }, [fetchApps])

  async function action(id: string, type: 'start' | 'stop' | 'restart') {
    setActionId(id)
    try {
      await apiFetch(`/api/applications/${id}/${type}`, { method: 'POST' })
      await fetchApps()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionId(null)
    }
  }

  async function deleteApp(id: string) {
    if (!confirm('Delete this application and its container?')) return
    setActionId(id)
    try {
      await apiFetch(`/api/applications/${id}`, { method: 'DELETE' })
      await fetchApps()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/applications/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          New Application
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 py-16 text-center">
          <p className="text-gray-400">No applications yet</p>
          <Link href="/applications/new" className="mt-3 inline-block text-sm text-blue-400 hover:underline">Deploy your first application</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Image</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Ports</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {apps.map((a) => {
                const busy = actionId === a.id
                return (
                  <tr key={a.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3">
                      <Link href={`/applications/${a.id}`} className="font-medium text-blue-400 hover:underline">{a.name}</Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">{a.image}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {a.ports.map((p) => `${p.host}:${p.container}`).join(', ') || '--'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {a.status !== 'running' && (
                          <button onClick={() => action(a.id, 'start')} disabled={busy} className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900 disabled:opacity-40">Start</button>
                        )}
                        {a.status === 'running' && (
                          <>
                            <button onClick={() => action(a.id, 'stop')} disabled={busy} className="rounded px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-900 disabled:opacity-40">Stop</button>
                            <button onClick={() => action(a.id, 'restart')} disabled={busy} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">Restart</button>
                          </>
                        )}
                        <button onClick={() => deleteApp(a.id)} disabled={busy} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-40">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
