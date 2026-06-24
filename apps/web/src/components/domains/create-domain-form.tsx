'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

interface Application { id: string; name: string; ports: Array<{ host: number; container: number }> }

export function CreateDomainForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [apps, setApps] = useState<Application[]>([])
  const [targetType, setTargetType] = useState<'application' | 'container' | 'port'>('port')
  const [selectedApp, setSelectedApp] = useState('')
  const [nginxOutput, setNginxOutput] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Application[]>('/api/applications').then(setApps).catch(() => setApps([]))
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setNginxOutput(null)
    setLoading(true)

    const fd = new FormData(e.currentTarget)

    const targetPort = parseInt(fd.get('targetPort') as string, 10)

    const payload = {
      domain: fd.get('domain') as string,
      targetType,
      targetId: targetType !== 'port' ? selectedApp || undefined : undefined,
      targetHost: '127.0.0.1',
      targetPort,
    }

    try {
      const result = await apiFetch<{ domain: { id: string }; nginxOutput: string }>('/api/domains', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (result.nginxOutput) setNginxOutput(result.nginxOutput)
      router.push('/domains')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create domain')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-6">
      {error && <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>}
      {nginxOutput && (
        <div className="rounded-md border border-yellow-800 bg-yellow-950 px-4 py-3">
          <p className="text-sm font-medium text-yellow-400">Nginx output:</p>
          <pre className="mt-1 text-xs text-yellow-300">{nginxOutput}</pre>
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-300">Domain Name</label>
          <input name="domain" required placeholder="app.example.com" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-300">Target Type</label>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value as typeof targetType)} className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none">
            <option value="port">Port (custom)</option>
            <option value="application">Application</option>
            <option value="container">Container ID</option>
          </select>
        </div>

        {targetType === 'application' && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-300">Application</label>
            <select value={selectedApp} onChange={(e) => setSelectedApp(e.target.value)} className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none">
              <option value="">Select application...</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name} (port {a.ports[0]?.host ?? '?'})</option>)}
            </select>
          </div>
        )}

        {targetType === 'container' && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-300">Container ID or Name</label>
            <input name="targetId" placeholder="container-name" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-300">Target Port</label>
          <input name="targetPort" type="number" required min={1} max={65535} placeholder="3000" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          <p className="text-xs text-gray-500">The local port to proxy traffic to</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Domain'}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-md border border-gray-700 px-6 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800">
          Cancel
        </button>
      </div>
    </form>
  )
}
