'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface ManagedDb { id: string; name: string; liveInfo: { size: string; owner: string } | null }
interface DbUser { id: string; username: string; createdAt: string }

export function ServerDetail({ serverId }: { serverId: string }) {
  const [databases, setDatabases] = useState<ManagedDb[]>([])
  const [users, setUsers] = useState<DbUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'databases' | 'users'>('databases')
  const [newDb, setNewDb] = useState('')
  const [creatingDb, setCreatingDb] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [dbs, usrs] = await Promise.all([
        apiFetch<ManagedDb[]>(`/api/pg/servers/${serverId}/databases`),
        apiFetch<DbUser[]>(`/api/pg/servers/${serverId}/users`),
      ])
      setDatabases(dbs)
      setUsers(usrs)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [serverId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function createDb(e: React.FormEvent) {
    e.preventDefault()
    setCreatingDb(true)
    try {
      await apiFetch(`/api/pg/servers/${serverId}/databases`, { method: 'POST', body: JSON.stringify({ name: newDb }) })
      setNewDb('')
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
    finally { setCreatingDb(false) }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setCreatingUser(true)
    setGeneratedPassword(null)
    try {
      const result = await apiFetch<{ generatedPassword?: string }>(`/api/pg/servers/${serverId}/users`, {
        method: 'POST',
        body: JSON.stringify({ username: newUser.username, password: newUser.password || undefined }),
      })
      if (result.generatedPassword) setGeneratedPassword(result.generatedPassword)
      setNewUser({ username: '', password: '' })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
    finally { setCreatingUser(false) }
  }

  async function deleteDb(dbId: string, name: string) {
    if (!confirm(`Delete database "${name}"? This is irreversible.`)) return
    try {
      await apiFetch(`/api/pg/servers/${serverId}/databases/${dbId}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
  }

  async function deleteUser(userId: string) {
    if (!confirm('Delete this user from PostgreSQL?')) return
    try {
      await apiFetch(`/api/pg/servers/${serverId}/users/${userId}`, { method: 'DELETE' })
      await fetchAll()
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
  }

  async function resetPassword(userId: string) {
    setGeneratedPassword(null)
    try {
      const result = await apiFetch<{ generatedPassword?: string }>(`/api/pg/servers/${serverId}/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({}) })
      if (result.generatedPassword) setGeneratedPassword(result.generatedPassword)
    } catch (e) { alert(e instanceof Error ? e.message : 'Failed') }
  }

  const inputCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none'

  if (loading) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-gray-800">
        {(['databases', 'users'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>{t}</button>
        ))}
      </div>

      {generatedPassword && (
        <div className="rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-3 text-sm">
          <p className="text-yellow-300 font-medium">Generated password (copy now &mdash; won&apos;t be shown again):</p>
          <code className="mt-1 block font-mono text-yellow-200">{generatedPassword}</code>
        </div>
      )}

      {tab === 'databases' && (
        <div className="space-y-4">
          <form onSubmit={createDb} className="flex gap-2">
            <input value={newDb} onChange={(e) => setNewDb(e.target.value.toLowerCase())} placeholder="my_database" pattern="[a-z0-9_]+" required className={`${inputCls} w-48`} />
            <button type="submit" disabled={creatingDb} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{creatingDb ? 'Creating...' : 'Create Database'}</button>
          </form>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Size</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Owner</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {databases.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No databases</td></tr>}
                {databases.map((db) => (
                  <tr key={db.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3"><Link href={`/databases/${serverId}/${db.id}`} className="font-medium text-blue-400 hover:underline">{db.name}</Link></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{db.liveInfo?.size ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{db.liveInfo?.owner ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteDb(db.id, db.name)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <form onSubmit={createUser} className="flex gap-2">
            <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase() })} placeholder="username" pattern="[a-z0-9_]+" required className={`${inputCls} w-36`} />
            <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Password (auto-generated if empty)" className={`${inputCls} w-64`} />
            <button type="submit" disabled={creatingUser} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{creatingUser ? 'Creating...' : 'Create User'}</button>
          </form>
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Username</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {users.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No users</td></tr>}
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3 font-mono">{u.username}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => resetPassword(u.id)} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900">Reset PW</button>
                        <button onClick={() => deleteUser(u.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Delete</button>
                      </div>
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
