'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface Schedule {
  schedule: {
    id: string; name: string; frequency: string; retentionCount: number
    enabled: boolean; lastRunAt: string | null; nextRunAt: string | null
  }
  dbName: string | null
  serverName: string | null
}

interface Run {
  run: {
    id: string; status: string; filePath: string | null
    fileSizeBytes: number | null; durationMs: number | null
    errorMessage: string | null; startedAt: string; completedAt: string | null
  }
  dbName: string | null
  serverName: string | null
}

interface DbServer { id: string; name: string }
interface ManagedDb { id: string; name: string; serverId: string }

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: 'bg-green-900 text-green-300 border-green-700',
    running: 'bg-blue-900 text-blue-300 border-blue-700',
    failed: 'bg-red-900 text-red-300 border-red-700',
  }
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${map[status] ?? map['failed']}`}>{status}</span>
}

function fmtBytes(b: number | null): string {
  if (!b) return '--'
  if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  return (b / 1e3).toFixed(1) + ' KB'
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '--'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function BackupDashboard() {
  const [tab, setTab] = useState<'schedules' | 'runs'>('schedules')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [servers, setServers] = useState<DbServer[]>([])
  const [databases, setDatabases] = useState<ManagedDb[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', serverId: '', databaseId: '', frequency: 'daily', retentionCount: '7' })
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [restoreOutput, setRestoreOutput] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [s, r, srv] = await Promise.allSettled([
      apiFetch<Schedule[]>('/api/backups/schedules'),
      apiFetch<Run[]>('/api/backups/runs'),
      apiFetch<DbServer[]>('/api/pg/servers'),
    ])
    if (s.status === 'fulfilled') setSchedules(s.value)
    if (r.status === 'fulfilled') setRuns(r.value)
    if (srv.status === 'fulfilled') {
      setServers(srv.value)
      if (srv.value.length > 0) {
        const dbs = await Promise.allSettled(
          srv.value.map((sv: DbServer) =>
            apiFetch<ManagedDb[]>(`/api/pg/servers/${sv.id}/databases`).then((rows: ManagedDb[]) =>
              rows.map((db: ManagedDb) => ({ ...db, serverId: sv.id }))
            )
          )
        )
        const allDbs: ManagedDb[] = []
        dbs.forEach((d: PromiseSettledResult<ManagedDb[]>) => { if (d.status === 'fulfilled') allDbs.push(...d.value) })
        setDatabases(allDbs)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/backups/schedules', {
        method: 'POST',
        body: JSON.stringify({ ...form, retentionCount: parseInt(form.retentionCount, 10) }),
      })
      setShowForm(false)
      await fetchAll()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
    finally { setSaving(false) }
  }

  async function runSchedule(id: string) {
    setActionId(id)
    try {
      await apiFetch(`/api/backups/schedules/${id}/run`, { method: 'POST' })
      setTimeout(fetchAll, 2000)
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
    finally { setActionId(null) }
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this backup schedule?')) return
    try {
      await apiFetch(`/api/backups/schedules/${id}`, { method: 'DELETE' })
      await fetchAll()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
  }

  async function restore(runId: string) {
    if (!confirm('Restore this backup? Existing data in the database will be overwritten.')) return
    setActionId(runId)
    setRestoreOutput(null)
    try {
      const result = await apiFetch<{ output: string; durationMs: number }>(`/api/backups/runs/${runId}/restore`, { method: 'POST' })
      setRestoreOutput(`Done in ${fmtDuration(result.durationMs)}.\n${result.output}`)
    } catch (err) { alert(err instanceof Error ? err.message : 'Restore failed') }
    finally { setActionId(null) }
  }

  async function deleteRun(id: string) {
    if (!confirm('Delete this backup file?')) return
    try {
      await apiFetch(`/api/backups/runs/${id}`, { method: 'DELETE' })
      await fetchAll()
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
  }

  const inputCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none'
  const filteredDbs = databases.filter((d) => !form.serverId || d.serverId === form.serverId)

  if (loading) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />

  return (
    <div className="space-y-4">
      {restoreOutput && (
        <div className="rounded-lg border border-green-800 bg-green-950 p-4">
          <p className="mb-1 text-xs font-medium text-green-400">Restore output:</p>
          <pre className="text-xs text-green-300 whitespace-pre-wrap">{restoreOutput}</pre>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-gray-800">
          {(['schedules', 'runs'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>{t}</button>
          ))}
        </div>
        {tab === 'schedules' && (
          <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">New Schedule</button>
        )}
      </div>

      {tab === 'schedules' && (
        <div className="space-y-4">
          {showForm && (
            <form onSubmit={saveSchedule} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">New Backup Schedule</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-xs text-gray-400">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Daily DB Backup" className={`${inputCls} w-full`} />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Server</label>
                  <select value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value, databaseId: '' })} required className={`${inputCls} w-full`}>
                    <option value="">Select server...</option>
                    {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Database</label>
                  <select value={form.databaseId} onChange={(e) => setForm({ ...form, databaseId: e.target.value })} required className={`${inputCls} w-full`}>
                    <option value="">Select database...</option>
                    {filteredDbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Frequency</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={`${inputCls} w-full`}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Keep last N backups</label>
                  <input type="number" min={1} max={90} value={form.retentionCount} onChange={(e) => setForm({ ...form, retentionCount: e.target.value })} className={`${inputCls} w-full`} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Create Schedule'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</button>
              </div>
            </form>
          )}

          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Database</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Frequency</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Last Run</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Next Run</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {schedules.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No schedules configured</td></tr>
                )}
                {schedules.map(({ schedule: s, dbName, serverName }) => (
                  <tr key={s.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{serverName} / {dbName}</td>
                    <td className="px-4 py-3 capitalize text-gray-300">{s.frequency}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : '--'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : '--'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => runSchedule(s.id)} disabled={actionId === s.id} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">Run Now</button>
                        <button onClick={() => deleteSchedule(s.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'runs' && (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Database</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Size</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Duration</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Started</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {runs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No backup runs yet</td></tr>
              )}
              {runs.map(({ run: r, dbName }) => (
                <tr key={r.id} className="hover:bg-gray-900">
                  <td className="px-4 py-3 font-medium">{dbName ?? '--'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtBytes(r.fileSizeBytes)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDuration(r.durationMs)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === 'success' && (
                        <button onClick={() => restore(r.id)} disabled={actionId === r.id} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">Restore</button>
                      )}
                      {r.status === 'failed' && r.errorMessage && (
                        <span title={r.errorMessage} className="cursor-help rounded px-2 py-1 text-xs text-red-400">Error</span>
                      )}
                      <button onClick={() => deleteRun(r.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Delete</button>
                    </div>
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
