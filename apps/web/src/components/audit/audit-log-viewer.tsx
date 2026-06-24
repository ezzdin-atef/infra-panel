'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface AuditLog {
  log: {
    id: string
    action: string
    resourceType: string | null
    resourceId: string | null
    resourceName: string | null
    metadata: Record<string, unknown> | null
    ipAddress: string | null
    status: string
    createdAt: string
  }
  userEmail: string | null
  userName: string | null
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'container.restart': 'Container Restart',
  'container.delete': 'Container Delete',
  'domain.create': 'Domain Created',
  'domain.delete': 'Domain Deleted',
  'ssl.issue': 'SSL Issued',
  'ssl.revoke': 'SSL Revoked',
  'database.create': 'Database Created',
  'database.delete': 'Database Deleted',
  'backup.run': 'Backup Run',
  'backup.restore': 'Backup Restored',
  'firewall.port': 'Firewall Port Rule',
  'firewall.ip': 'Firewall IP Rule',
  'firewall.rule.delete': 'Firewall Rule Deleted',
}

const ACTION_COLORS: Record<string, string> = {
  'auth.login': 'bg-blue-900 text-blue-300 border-blue-700',
  'auth.logout': 'bg-gray-800 text-gray-300 border-gray-700',
  'container.delete': 'bg-red-900 text-red-300 border-red-700',
  'domain.create': 'bg-green-900 text-green-300 border-green-700',
  'domain.delete': 'bg-red-900 text-red-300 border-red-700',
  'ssl.issue': 'bg-green-900 text-green-300 border-green-700',
  'ssl.revoke': 'bg-orange-900 text-orange-300 border-orange-700',
  'database.create': 'bg-green-900 text-green-300 border-green-700',
  'database.delete': 'bg-red-900 text-red-300 border-red-700',
  'backup.run': 'bg-purple-900 text-purple-300 border-purple-700',
  'backup.restore': 'bg-yellow-900 text-yellow-300 border-yellow-700',
  'firewall.port': 'bg-orange-900 text-orange-300 border-orange-700',
  'firewall.ip': 'bg-orange-900 text-orange-300 border-orange-700',
  'firewall.rule.delete': 'bg-red-900 text-red-300 border-red-700',
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ action: '', resourceType: '' })
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter.action) params.set('action', filter.action)
      if (filter.resourceType) params.set('resourceType', filter.resourceType)
      params.set('limit', '200')
      const data = await apiFetch<AuditLog[]>(`/api/audit?${params.toString()}`)
      setLogs(data)
    } catch {}
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const allActions = Array.from(new Set(logs.map((l) => l.log.action))).sort()
  const allTypes = Array.from(new Set(logs.map((l) => l.log.resourceType).filter(Boolean))).sort() as string[]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={filter.action}
          onChange={(e) => setFilter({ ...filter, action: e.target.value })}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All Actions</option>
          {allActions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
        </select>
        <select
          value={filter.resourceType}
          onChange={(e) => setFilter({ ...filter, resourceType: e.target.value })}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All Resources</option>
          {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={fetchLogs} className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">
          Refresh
        </button>
        <span className="ml-auto flex items-center text-xs text-gray-500">{logs.length} entries</span>
      </div>

      {loading && <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />}
      {!loading && logs.length === 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-12 text-center text-sm text-gray-500">
          No audit log entries yet.
        </div>
      )}
      {!loading && logs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {logs.map(({ log: l, userEmail, userName }) => (
                <>
                  <tr
                    key={l.id}
                    className="cursor-pointer hover:bg-gray-900"
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  >
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${ACTION_COLORS[l.action] ?? 'bg-gray-800 text-gray-300 border-gray-700'}`}>
                        {ACTION_LABELS[l.action] ?? l.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{userName ?? userEmail ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{l.resourceName ?? l.resourceId ?? l.resourceType ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${l.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{l.ipAddress ?? '—'}</td>
                  </tr>
                  {expanded === l.id && l.metadata && (
                    <tr key={`${l.id}-meta`} className="bg-gray-900">
                      <td colSpan={6} className="px-4 py-2">
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap">{JSON.stringify(l.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
