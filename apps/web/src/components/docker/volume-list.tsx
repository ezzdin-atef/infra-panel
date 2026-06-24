'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
  created: string
  scope: string
}

export function VolumeList() {
  const [volumes, setVolumes] = useState<DockerVolume[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)

  const fetchVolumes = useCallback(async () => {
    try {
      const data = await apiFetch<DockerVolume[]>('/api/docker/volumes')
      setVolumes(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load volumes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVolumes() }, [fetchVolumes])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/api/docker/volumes', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      setNewName('')
      await fetchVolumes()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete volume "${name}"? Data will be lost.`)) return
    setDeletingName(name)
    try {
      await apiFetch(`/api/docker/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' })
      await fetchVolumes()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingName(null)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          placeholder="my-volume"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-64 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Volume'}
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
                <th className="px-4 py-3 text-left font-medium text-gray-400">Mountpoint</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {volumes.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No volumes found</td></tr>
              )}
              {volumes.map((v) => (
                <tr key={v.name} className="hover:bg-gray-900">
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{v.driver}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 max-w-xs truncate">{v.mountpoint}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(v.name)}
                      disabled={deletingName === v.name}
                      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-40"
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
