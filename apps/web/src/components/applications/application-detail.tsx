'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

interface Application {
  id: string
  name: string
  image: string
  containerId: string | null
  status: string
  ports: Array<{ host: number; container: number; protocol: string }>
  createdAt: string
  updatedAt: string
}

interface EnvVar { id: string; key: string; value: string; isSecret: boolean; createdAt: string }

export function ApplicationDetail({ id }: { id: string }) {
  const router = useRouter()
  const [app, setApp] = useState<Application | null>(null)
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [tab, setTab] = useState<'overview' | 'logs' | 'env'>('overview')
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [newEnv, setNewEnv] = useState({ key: '', value: '', isSecret: false })
  const [addingEnv, setAddingEnv] = useState(false)

  const fetchApp = useCallback(async () => {
    try {
      const data = await apiFetch<Application>(`/api/applications/${id}`)
      setApp(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [id])

  const fetchEnv = useCallback(async () => {
    try {
      const data = await apiFetch<EnvVar[]>(`/api/applications/${id}/env`)
      setEnvVars(data)
    } catch { setEnvVars([]) }
  }, [id])

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiFetch<{ lines: string[] }>(`/api/applications/${id}/logs?tail=200`)
      setLogs(data.lines)
    } catch { setLogs([]) }
  }, [id])

  useEffect(() => { fetchApp() }, [fetchApp])
  useEffect(() => {
    if (tab === 'env') fetchEnv()
    if (tab === 'logs') fetchLogs()
  }, [tab, fetchEnv, fetchLogs])

  async function doAction(type: string) {
    setActionLoading(true)
    try {
      if (type === 'delete') {
        if (!confirm('Delete this application and its container?')) return
        await apiFetch(`/api/applications/${id}`, { method: 'DELETE' })
        router.push('/applications')
        return
      }
      await apiFetch(`/api/applications/${id}/${type}`, { method: 'POST' })
      await fetchApp()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  async function addEnvVar(e: React.FormEvent) {
    e.preventDefault()
    if (!newEnv.key) return
    setAddingEnv(true)
    try {
      await apiFetch(`/api/applications/${id}/env`, {
        method: 'POST',
        body: JSON.stringify(newEnv),
      })
      setNewEnv({ key: '', value: '', isSecret: false })
      await fetchEnv()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add')
    } finally {
      setAddingEnv(false)
    }
  }

  async function deleteEnvVar(envId: string) {
    if (!confirm('Delete this variable?')) return
    try {
      await apiFetch(`/api/applications/${id}/env/${envId}`, { method: 'DELETE' })
      await fetchEnv()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>
  if (!app) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />

  const busy = actionLoading

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{app.name}</h1>
          <p className="mt-1 font-mono text-sm text-gray-400">{app.image}</p>
        </div>
        <div className="flex gap-2">
          {app.status !== 'running' && (
            <button onClick={() => doAction('start')} disabled={busy} className="rounded-md bg-green-700 px-3 py-1.5 text-sm text-white hover:bg-green-600 disabled:opacity-40">Start</button>
          )}
          {app.status === 'running' && (
            <>
              <button onClick={() => doAction('stop')} disabled={busy} className="rounded-md bg-yellow-700 px-3 py-1.5 text-sm text-white hover:bg-yellow-600 disabled:opacity-40">Stop</button>
              <button onClick={() => doAction('restart')} disabled={busy} className="rounded-md bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-40">Restart</button>
            </>
          )}
          <button onClick={() => doAction('delete')} disabled={busy} className="rounded-md bg-red-900 px-3 py-1.5 text-sm text-red-300 hover:bg-red-800 disabled:opacity-40">Delete</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {(['overview', 'logs', 'env'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>
            {t === 'env' ? 'Environment' : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <InfoCard title="Status">
            <div className="flex gap-4 text-sm">
              <span className="text-gray-400">State</span>
              <span className={app.status === 'running' ? 'text-green-400' : 'text-gray-300'}>{app.status}</span>
            </div>
          </InfoCard>
          <InfoCard title="Ports">
            {app.ports.length === 0
              ? <p className="text-sm text-gray-500">No ports exposed</p>
              : app.ports.map((p, i) => <p key={i} className="font-mono text-sm">{p.host}:{p.container}/{p.protocol}</p>)
            }
          </InfoCard>
          <InfoCard title="Container ID">
            <p className="font-mono text-sm text-gray-300">{app.containerId?.slice(0, 12) ?? '--'}</p>
          </InfoCard>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <button onClick={fetchLogs} className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">Refresh</button>
          <div className="h-96 overflow-y-auto rounded-lg border border-gray-800 bg-black p-3 font-mono text-xs text-green-400">
            {logs.length === 0 ? <span className="text-gray-600">No log output</span> : logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {tab === 'env' && (
        <div className="space-y-4">
          <form onSubmit={addEnvVar} className="flex gap-2">
            <input placeholder="KEY" value={newEnv.key} onChange={(e) => setNewEnv({ ...newEnv, key: e.target.value.toUpperCase() })} className="w-36 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm focus:outline-none" />
            <input
              placeholder="value"
              type={newEnv.isSecret ? 'password' : 'text'}
              value={newEnv.value}
              onChange={(e) => setNewEnv({ ...newEnv, value: e.target.value })}
              className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm focus:outline-none"
            />
            <label className="flex items-center gap-1 text-xs text-gray-400">
              <input type="checkbox" checked={newEnv.isSecret} onChange={(e) => setNewEnv({ ...newEnv, isSecret: e.target.checked })} className="accent-blue-500" />
              Secret
            </label>
            <button type="submit" disabled={addingEnv} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
          </form>

          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Key</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Value</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {envVars.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-500">No variables</td></tr>}
                {envVars.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-3 font-mono text-blue-400">{ev.key}</td>
                    <td className="px-4 py-3 font-mono text-gray-300">{ev.value}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteEnvVar(ev.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      {children}
    </div>
  )
}
