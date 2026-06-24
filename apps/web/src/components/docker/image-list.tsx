'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface DockerImage {
  id: string
  repoTags: string[]
  size: number
  created: number
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(1) + ' KB'
}

export function ImageList() {
  const [images, setImages] = useState<DockerImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pullImage, setPullImage] = useState('')
  const [pulling, setPulling] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchImages = useCallback(async () => {
    try {
      const data = await apiFetch<DockerImage[]>('/api/docker/images')
      setImages(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load images')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchImages() }, [fetchImages])

  async function handlePull(e: React.FormEvent) {
    e.preventDefault()
    if (!pullImage.trim()) return
    setPulling(true)
    try {
      await apiFetch('/api/docker/images/pull', {
        method: 'POST',
        body: JSON.stringify({ image: pullImage.trim() }),
      })
      setPullImage('')
      await fetchImages()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Pull failed')
    } finally {
      setPulling(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this image?')) return
    setDeletingId(id)
    try {
      await apiFetch(`/api/docker/images/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await fetchImages()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handlePull} className="flex gap-2">
        <input
          type="text"
          placeholder="nginx:latest"
          value={pullImage}
          onChange={(e) => setPullImage(e.target.value)}
          className="w-64 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pulling}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pulling ? 'Pulling...' : 'Pull Image'}
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
                <th className="px-4 py-3 text-left font-medium text-gray-400">Tag</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Size</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {images.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No images found</td></tr>
              )}
              {images.map((img) => (
                <tr key={img.id} className="hover:bg-gray-900">
                  <td className="px-4 py-3 font-mono text-xs">{img.repoTags[0] ?? '<none>'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{img.id.replace('sha256:', '').slice(0, 12)}</td>
                  <td className="px-4 py-3 text-gray-300">{formatBytes(img.size)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(img.id)}
                      disabled={deletingId === img.id}
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
