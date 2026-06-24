'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface DomainRow {
  domain: {
    id: string
    domain: string
    targetType: string
    targetHost: string
    targetPort: number
    enabled: boolean
    sslEnabled: boolean
    createdAt: string
  }
  route: {
    id: string
    isValid: boolean
    configPath: string
  } | null
}

export function DomainList() {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    try {
      const data = await apiFetch<DomainRow[]>('/api/domains')
      setDomains(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load domains')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDomains() }, [fetchDomains])

  async function toggle(id: string, enabled: boolean) {
    setActionId(id)
    try {
      await apiFetch(`/api/domains/${id}/${enabled ? 'disable' : 'enable'}`, { method: 'POST' })
      await fetchDomains()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    } finally {
      setActionId(null)
    }
  }

  async function deleteDomain(id: string) {
    if (!confirm('Delete this domain and remove its nginx config?')) return
    setActionId(id)
    try {
      await apiFetch(`/api/domains/${id}`, { method: 'DELETE' })
      await fetchDomains()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setActionId(null)
    }
  }

  if (loading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>
  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/domains/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          New Domain
        </Link>
      </div>

      {domains.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 py-16 text-center">
          <p className="text-gray-400">No domains configured</p>
          <Link href="/domains/new" className="mt-3 inline-block text-sm text-blue-400 hover:underline">Add your first domain</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Domain</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Target</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Config</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {domains.map(({ domain: d, route }) => {
                const busy = actionId === d.id
                return (
                  <tr key={d.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.domain}</span>
                        {d.sslEnabled && <span className="rounded bg-green-900 px-1 py-0.5 text-xs text-green-400">SSL</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{d.targetHost}:{d.targetPort}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${d.enabled ? 'border-green-700 bg-green-900 text-green-300' : 'border-gray-600 bg-gray-800 text-gray-400'}`}>
                        {d.enabled ? 'enabled' : 'disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {route ? (
                        <span className={`text-xs ${route.isValid ? 'text-green-400' : 'text-red-400'}`}>
                          {route.isValid ? 'valid' : 'invalid'}
                        </span>
                      ) : <span className="text-xs text-gray-600">no config</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => toggle(d.id, d.enabled)} disabled={busy} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">
                          {d.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => deleteDomain(d.id)} disabled={busy} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-40">Delete</button>
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
