'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface DbServer { id: string; name: string; host: string; port: number; adminUser: string; sslMode: string }

export function ServerList() {
  const [servers, setServers] = useState<DbServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', host: '', port: '5432', adminUser: '', adminPassword: '', sslMode: 'prefer' })
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; error?: string } | null>(null)

  const fetchServers = useCallback(async () => {
    try {
      const data = await apiFetch<DbServer[]>('/api/pg/servers')
      setServers(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load servers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchServers() }, [fetchServers])

  async function saveServer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/pg/servers', {
        method: 'POST',
        body: JSON.stringify({ ...form, port: parseInt(form.port, 10) }),
      })
      setShowForm(false)
      setForm({ name: '', host: '', port: '5432', adminUser: '', adminPassword: '', sslMode: 'prefer' })
      await fetchServers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function testConn(id: string) {
    setTestingId(id)
    setTestResult(null)
    try {
      const result = await apiFetch<{ success: boolean; error?: string }>(`/api/pg/servers/${id}/test`, { method: 'POST' })
      setTestResult({ id, ...result })
    } catch (e) {
      setTestResult({ id, success: false, error: e instanceof Error ? e.message : 'Failed' })
    } finally {
      setTestingId(null)
    }
  }

  async function deleteServer(id: string) {
    if (!confirm('Delete this server? All associated databases/users will also be removed from the panel.')) return
    try {
      await apiFetch(`/api/pg/servers/${id}`, { method: 'DELETE' })
      await fetchServers()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>
  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Add Server</button>
      </div>

      {showForm && (
        <form onSubmit={saveServer} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Add PostgreSQL Server</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="text-xs text-gray-400">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="My PG Server" className={inputCls} /></div>
            <div><label className="text-xs text-gray-400">Host</label><input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required placeholder="127.0.0.1" className={inputCls} /></div>
            <div><label className="text-xs text-gray-400">Port</label><input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} required className={inputCls} /></div>
            <div><label className="text-xs text-gray-400">Admin User</label><input value={form.adminUser} onChange={(e) => setForm({ ...form, adminUser: e.target.value })} required placeholder="postgres" className={inputCls} /></div>
            <div><label className="text-xs text-gray-400">Admin Password</label><input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} required className={inputCls} /></div>
            <div>
              <label className="text-xs text-gray-400">SSL Mode</label>
              <select value={form.sslMode} onChange={(e) => setForm({ ...form, sslMode: e.target.value })} className={inputCls}>
                <option value="disable">Disable</option>
                <option value="prefer">Prefer</option>
                <option value="require">Require</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Server'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</button>
          </div>
        </form>
      )}

      {testResult && (
        <div className={`rounded-lg border px-4 py-2 text-sm ${testResult.success ? 'border-green-700 bg-green-900 text-green-300' : 'border-red-700 bg-red-900 text-red-300'}`}>
          {testResult.success ? 'Connection successful' : `Connection failed: ${testResult.error}`}
        </div>
      )}

      {servers.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 py-16 text-center">
          <p className="text-gray-400">No PostgreSQL servers added yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Host</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Port</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">User</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {servers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-900">
                  <td className="px-4 py-3"><Link href={`/databases/${s.id}`} className="font-medium text-blue-400 hover:underline">{s.name}</Link></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">{s.host}</td>
                  <td className="px-4 py-3 text-gray-300">{s.port}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{s.adminUser}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => testConn(s.id)} disabled={testingId === s.id} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">{testingId === s.id ? 'Testing...' : 'Test'}</button>
                      <button onClick={() => deleteServer(s.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Delete</button>
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
