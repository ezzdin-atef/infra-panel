'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

type Tab = 'general' | 'security' | 'system'

interface SystemCheck { name: string; status: 'ok' | 'error'; version?: string; message?: string }
interface Session { id: string; createdAt: string; expiresAt?: string; ipAddress?: string; userAgent?: string }

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // security
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)

  // sessions
  const [sessions, setSessions] = useState<Session[]>([])

  // system checks
  const [checks, setChecks] = useState<SystemCheck[] | null>(null)
  const [checksLoading, setChecksLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, string>>('/api/settings')
      setSettings(data)
      setForm(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  useEffect(() => {
    if (tab === 'security') {
      apiFetch<Session[]>('/api/settings/sessions').then(setSessions).catch(() => {})
    }
    if (tab === 'system' && !checks) {
      setChecksLoading(true)
      apiFetch<SystemCheck[]>('/api/settings/system-checks')
        .then(setChecks)
        .catch(() => {})
        .finally(() => setChecksLoading(false))
    }
  }, [tab, checks])

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          server_name: form['server_name'],
          timezone: form['timezone'],
          backup_dir: form['backup_dir'],
          panel_domain: form['panel_domain'],
          session_timeout_minutes: parseInt(form['session_timeout_minutes'] ?? '1440', 10),
        }),
      })
      setFeedback({ type: 'success', message: 'Settings saved.' })
      await fetchSettings()
    } catch (e) {
      setFeedback({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setFeedback({ type: 'error', message: 'New passwords do not match.' })
      return
    }
    setPwSaving(true)
    setFeedback(null)
    try {
      await apiFetch('/api/settings/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      })
      setFeedback({ type: 'success', message: 'Password changed successfully.' })
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e) {
      setFeedback({ type: 'error', message: e instanceof Error ? e.message : 'Failed to change password' })
    } finally {
      setPwSaving(false)
    }
  }

  async function revokeSession(id: string) {
    if (!confirm('Revoke this session?')) return
    try {
      await apiFetch(`/api/settings/sessions/${id}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const inputCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none w-full'
  const labelCls = 'block text-xs text-gray-400 mb-1'

  if (loading) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />

  return (
    <div className="space-y-4">
      {feedback && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-green-800 bg-green-950 text-green-300' : 'border-red-800 bg-red-950 text-red-400'}`}>
          {feedback.message}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-800">
        {(['general', 'security', 'system'] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setFeedback(null) }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <form onSubmit={saveGeneral} className="max-w-lg space-y-4">
          <div>
            <label className={labelCls}>Server Name</label>
            <input value={form['server_name'] ?? ''} onChange={(e) => setForm({ ...form, server_name: e.target.value })} className={inputCls} placeholder="My Server" />
          </div>
          <div>
            <label className={labelCls}>Timezone</label>
            <input value={form['timezone'] ?? ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={inputCls} placeholder="UTC" />
            <p className="mt-1 text-xs text-gray-500">e.g. America/New_York, Europe/London</p>
          </div>
          <div>
            <label className={labelCls}>Backup Directory</label>
            <input value={form['backup_dir'] ?? ''} onChange={(e) => setForm({ ...form, backup_dir: e.target.value })} className={inputCls} placeholder="/var/backups/infra-panel" />
          </div>
          <div>
            <label className={labelCls}>Panel Domain</label>
            <input value={form['panel_domain'] ?? ''} onChange={(e) => setForm({ ...form, panel_domain: e.target.value })} className={inputCls} placeholder="panel.example.com" />
          </div>
          <div>
            <label className={labelCls}>Session Timeout (minutes)</label>
            <input type="number" min={5} max={43200} value={form['session_timeout_minutes'] ?? '1440'} onChange={(e) => setForm({ ...form, session_timeout_minutes: e.target.value })} className={inputCls} />
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      )}

      {tab === 'security' && (
        <div className="space-y-8 max-w-lg">
          <div>
            <h2 className="mb-4 text-sm font-semibold text-gray-300">Change Password</h2>
            <form onSubmit={changePassword} className="space-y-3">
              <div>
                <label className={labelCls}>Current Password</label>
                <input type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>New Password</label>
                <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required minLength={8} className={inputCls} />
                <p className="mt-1 text-xs text-gray-500">Min 8 characters, uppercase, lowercase, number</p>
              </div>
              <div>
                <label className={labelCls}>Confirm New Password</label>
                <input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} required className={inputCls} />
              </div>
              <button type="submit" disabled={pwSaving} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {pwSaving ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>

          <div>
            <h2 className="mb-4 text-sm font-semibold text-gray-300">Active Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-500">No sessions found.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 bg-gray-950">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-900">
                        <td className="px-4 py-3 text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => revokeSession(s.id)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900">Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div className="max-w-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">System Dependencies</h2>
            <button onClick={() => { setChecks(null) }} className="text-xs text-gray-400 hover:text-gray-200">Re-check</button>
          </div>
          {checksLoading && <div className="h-32 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />}
          {!checksLoading && checks && (
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Version / Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-950">
                  {checks.map((c) => (
                    <tr key={c.name} className="hover:bg-gray-900">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-medium ${c.status === 'ok' ? 'border-green-700 bg-green-900 text-green-300' : 'border-red-700 bg-red-900 text-red-300'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${c.status === 'ok' ? 'bg-green-400' : 'bg-red-400'}`} />
                          {c.status === 'ok' ? 'Installed' : 'Not found'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{c.version ?? c.message ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
