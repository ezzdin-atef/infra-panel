'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface Container {
  id: string
  names: string[]
  image: string
  status: string
  state: string
  created: number
  ports: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    running: 'bg-green-900 text-green-300 border-green-700',
    exited: 'bg-gray-800 text-gray-400 border-gray-600',
    paused: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    restarting: 'bg-blue-900 text-blue-300 border-blue-700',
    dead: 'bg-red-900 text-red-300 border-red-700',
  }
  const cls = map[state] ?? 'bg-gray-800 text-gray-400 border-gray-600'
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {state}
    </span>
  )
}

export function ContainerList() {
  const [containers, setContainers] = useState<Container[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchContainers = useCallback(async () => {
    try {
      const data = await apiFetch<Container[]>('/api/docker/containers')
      setContainers(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load containers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
    const id = setInterval(fetchContainers, 8000)
    return () => clearInterval(id)
  }, [fetchContainers])

  async function action(id: string, type: 'start' | 'stop' | 'restart') {
    setActionId(id)
    try {
      await apiFetch(`/api/docker/containers/${id}/${type}`, { method: 'POST' })
      await fetchContainers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionId(null)
    }
  }

  async function deleteContainer(id: string) {
    if (!confirm('Delete this container? This cannot be undone.')) return
    setActionId(id)
    try {
      await apiFetch(`/api/docker/containers/${id}?force=true`, { method: 'DELETE' })
      await fetchContainers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{containers.length} container{containers.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Link href="/docker/images" className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800">
            Images
          </Link>
          <Link href="/docker/networks" className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800">
            Networks
          </Link>
          <Link href="/docker/volumes" className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800">
            Volumes
          </Link>
        </div>
      </div>

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
            {containers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No containers found</td>
              </tr>
            )}
            {containers.map((c) => {
              const busy = actionId === c.id
              return (
                <tr key={c.id} className="hover:bg-gray-900">
                  <td className="px-4 py-3">
                    <Link href={`/docker/${c.id}`} className="font-medium text-blue-400 hover:underline">
                      {c.names[0] ?? c.id.slice(0, 12)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{c.image}</td>
                  <td className="px-4 py-3"><StateBadge state={c.state} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {c.ports.filter((p) => p.PublicPort).map((p) => `${p.PublicPort}:${p.PrivatePort}`).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {c.state !== 'running' && (
                        <button onClick={() => action(c.id, 'start')} disabled={busy} className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900 disabled:opacity-40">
                          Start
                        </button>
                      )}
                      {c.state === 'running' && (
                        <>
                          <button onClick={() => action(c.id, 'stop')} disabled={busy} className="rounded px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-900 disabled:opacity-40">
                            Stop
                          </button>
                          <button onClick={() => action(c.id, 'restart')} disabled={busy} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">
                            Restart
                          </button>
                        </>
                      )}
                      <button onClick={() => deleteContainer(c.id)} disabled={busy} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-40">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
