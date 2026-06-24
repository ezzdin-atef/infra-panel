'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface DockerNetwork {
  id: string
  name: string
  driver: string
  scope: string
  internal: boolean
  created: string
  containers: number
}

export function NetworkList() {
  const [networks, setNetworks] = useState<DockerNetwork[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchNetworks = useCallback(async () => {
    try {
      const data = await apiFetch<DockerNetwork[]>('/api/docker/networks')
      setNetworks(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load networks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNetworks() }, [fetchNetworks])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/api/docker/networks', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      setNewName('')
      await fetchNetworks()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this network?')) return
    setDeletingId(id)
    try {
      await apiFetch(`/api/docker/networks/${id}`, { method: 'DELETE' })
      await fetchNetworks()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="my-network"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-64 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Network'}
        </button>
      </form>

      {error && <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Driver</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Scope</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Containers</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {networks.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No networks found</td></tr>
              )}
              {networks.map((n) => (
                <tr key={n.id} className="hover:bg-gray-900">
                  <td className="px-4 py-3 font-medium">{n.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{n.driver}</td>
                  <td className="px-4 py-3 text-gray-300">{n.scope}</td>
                  <td className="px-4 py-3 text-gray-300">{n.containers}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(n.id)}
                      disabled={deletingId === n.id || ['bridge', 'host', 'none'].includes(n.name)}
                      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
