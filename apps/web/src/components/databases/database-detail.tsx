'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface Permission { id: string; permissionType: string; username: string | null; userId: string }
interface Link { id: string; appName: string | null; username: string | null; applicationId: string }
interface DbUser { id: string; username: string }
interface App { id: string; name: string }
interface Stats { size: string; connections: number; tables: number }

export function DatabaseDetail({ serverId, dbId }: { serverId: string; dbId: string }) {
  const [perms, setPerms] = useState<Permission[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [users, setUsers] = useState<DbUser[]>([])
  const [apps, setApps] = useState<App[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [tab, setTab] = useState<'overview' | 'permissions' | 'links'>('overview')
  const [grantForm, setGrantForm] = useState({ userId: '', permissionType: 'readonly' })
  const [granting, setGranting] = useState(false)
  const [linkForm, setLinkForm] = useState({ applicationId: '', userId: '' })
  const [linking, setLinking] = useState(false)

  const fetchAll = useCallback(async () => {
    const [p, l, u, a, s] = await Promise.allSettled([
      apiFetch<Permission[]>(`/api/pg/servers/${serverId}/databases/${dbId}/permissions`),
      apiFetch<Link[]>(`/api/pg/servers/${serverId}/databases/${dbId}/links`),
      apiFetch<DbUser[]>(`/api/pg/servers/${serverId}/users`),
      apiFetch<App[]>('/api/applications'),
      apiFetch<Stats>(`/api/pg/servers/${serverId}/databases/${dbId}/stats`),
    ])
    if (p.status === 'fulfilled') setPerms(p.value)
    if (l.status === 'fulfilled') setLinks(l.value)
    if (u.status === 'fulfilled') setUsers(u.value)
    if (a.status === 'fulfilled') setApps(a.value)
    if (s.status === 'fulfilled') setStats(s.value)
  }, [serverId, dbId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function grantPerm(e: React.FormEvent) {
    e.preventDefault()
    setGranting(true)
    try {
      await apiFetch(`/api/pg/servers/${serverId}/databases/${dbId}/permissions`, {
        method: 'POST',
        body: JSON.stringify(grantForm),
      })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
    finally { setGranting(false) }
  }

  async function revokePerm(permId: string) {
    if (!confirm('Revoke this permission?')) return
    try {
      await apiFetch(`/api/pg/servers/${serverId}/databases/${dbId}/permissions/${permId}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
  }

  async function linkApp(e: React.FormEvent) {
    e.preventDefault()
    setLinking(true)
    try {
      const result = await apiFetch<{ connectionUrl: string }>(`/api/pg/servers/${serverId}/databases/${dbId}/links`, {
        method: 'POST',
        body: JSON.stringify({ applicationId: linkForm.applicationId, userId: linkForm.userId || undefined }),
      })
      alert(`Linked! DATABASE_URL: ${result.connectionUrl}`)
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
    finally { setLinking(false) }
  }

  async function unlinkApp(linkId: string) {
    if (!confirm('Unlink this application?')) return
    try {
      await apiFetch(`/api/pg/servers/${serverId}/databases/${dbId}/links/${linkId}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
  }

  const selectCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none'

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-800">
        {(['overview', 'permissions', 'links'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Size', value: stats?.size ?? '—' },
            { label: 'Active Connections', value: stats?.connections?.toString() ?? '—' },
            { label: 'Tables', value: stats?.tables?.toString() ?? '—' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'permissions' && (
        <div className="space-y-4">
          <form onSubmit={grantPerm} className="flex gap-2">
            <select value={grantForm.userId} onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })} required className={selectCls}>
              <option value="">Select user...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <select value={grantForm.permissionType} onChange={(e) => setGrantForm({ ...grantForm, permissionType: e.target.value })} className={selectCls}>
              <option value="readonly">Read Only</option>
              <option value="readwrite">Read/Write</option>
              <option value="full">Full Access</option>
            </select>
            <button type="submit" disabled={granting} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{granting ? 'Granting...' : 'Grant'}</button>
          </form>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">User</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Permission</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {perms.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No permissions granted</td></tr>}
                {perms.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono">{p.username ?? '—'}</td>
                    <td className="px-4 py-3"><span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{p.permissionType}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => revokePerm(p.id)} className="text-xs text-red-400 hover:underline">Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'links' && (
        <div className="space-y-4">
          <form onSubmit={linkApp} className="flex gap-2">
            <select value={linkForm.applicationId} onChange={(e) => setLinkForm({ ...linkForm, applicationId: e.target.value })} required className={selectCls}>
              <option value="">Select application...</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={linkForm.userId} onChange={(e) => setLinkForm({ ...linkForm, userId: e.target.value })} className={selectCls}>
              <option value="">Use admin credentials</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <button type="submit" disabled={linking} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{linking ? 'Linking...' : 'Link App'}</button>
          </form>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Application</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">DB User</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {links.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No applications linked</td></tr>}
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium">{l.appName ?? l.applicationId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{l.username ?? 'admin'}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => unlinkApp(l.id)} className="text-xs text-red-400 hover:underline">Unlink</button></td>
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
