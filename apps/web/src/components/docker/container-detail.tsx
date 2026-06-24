'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  running: boolean
  started: string
  finished: string
  ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>
  mounts: Array<{ Type: string; Source: string; Destination: string; Mode: string }>
  networks: string[]
  env: string[]
  labels: Record<string, string>
}

export function ContainerDetail({ id }: { id: string }) {
  const [info, setInfo] = useState<ContainerInfo | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [logSearch, setLogSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'overview' | 'logs' | 'env'>('overview')

  const fetchInfo = useCallback(async () => {
    try {
      const data = await apiFetch<ContainerInfo>(`/api/docker/containers/${id}`)
      setInfo(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load container')
    }
  }, [id])

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiFetch<{ lines: string[] }>(
        `/api/docker/containers/${id}/logs?tail=200&search=${encodeURIComponent(logSearch)}`
      )
      setLogs(data.lines)
    } catch {
      setLogs([])
    }
  }, [id, logSearch])

  useEffect(() => { fetchInfo() }, [fetchInfo])
  useEffect(() => { if (tab === 'logs') fetchLogs() }, [tab, fetchLogs])

  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>
  if (!info) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{info.name}</h1>
          <p className="mt-1 font-mono text-sm text-gray-400">{info.image}</p>
        </div>
        <span className={`mt-1 rounded-full px-3 py-1 text-xs font-medium ${info.running ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-400'}`}>
          {info.status}
        </span>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {(['overview', 'logs', 'env'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Ports">
            {Object.entries(info.ports ?? {}).length === 0 ? (
              <p className="text-sm text-gray-500">No ports exposed</p>
            ) : (
              Object.entries(info.ports ?? {}).map(([containerPort, bindings]) => (
                <div key={containerPort} className="flex justify-between text-sm">
                  <span className="font-mono text-gray-400">{containerPort}</span>
                  <span className="font-mono">{bindings?.map((b) => `${b.HostIp}:${b.HostPort}`).join(', ') ?? 'not bound'}</span>
                </div>
              ))
            )}
          </Section>
          <Section title="Mounts">
            {info.mounts.length === 0 ? (
              <p className="text-sm text-gray-500">No mounts</p>
            ) : (
              info.mounts.map((m, i) => (
                <div key={i} className="text-sm">
                  <span className="font-mono text-gray-400">{m.Source}</span>
                  <span className="text-gray-600"> -&gt; </span>
                  <span className="font-mono">{m.Destination}</span>
                </div>
              ))
            )}
          </Section>
          <Section title="Networks">
            {info.networks.length === 0 ? (
              <p className="text-sm text-gray-500">No networks</p>
            ) : (
              info.networks.map((n) => <p key={n} className="font-mono text-sm">{n}</p>)
            )}
          </Section>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search logs..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="w-64 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button onClick={fetchLogs} className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
              Search
            </button>
          </div>
          <div className="h-96 overflow-y-auto rounded-lg border border-gray-800 bg-black p-3 font-mono text-xs text-green-400">
            {logs.length === 0 ? (
              <span className="text-gray-600">No log output</span>
            ) : (
              logs.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </div>
      )}

      {tab === 'env' && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          {info.env?.length === 0 ? (
            <p className="text-sm text-gray-500">No environment variables</p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {info.env?.map((e, i) => {
                const eq = e.indexOf('=')
                const key = eq >= 0 ? e.slice(0, eq) : e
                const val = eq >= 0 ? e.slice(eq + 1) : ''
                return (
                  <div key={i} className="flex gap-2">
                    <span className="text-blue-400">{key}</span>
                    <span className="text-gray-600">=</span>
                    <span className="text-gray-300">{val}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      {children}
    </div>
  )
}
