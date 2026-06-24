'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface UfwRule { to: string; action: string; from: string }
interface UfwStatus { active: boolean; rules: UfwRule[]; rawOutput: string }

export function FirewallManager() {
  const [status, setStatus] = useState<UfwStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [portForm, setPortForm] = useState({ port: '', protocol: 'tcp', action: 'allow' })
  const [ipForm, setIpForm] = useState({ ip: '', action: 'allow' })
  const [submitting, setSubmitting] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<UfwStatus>('/api/firewall/status')
      setStatus(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load firewall status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function applyPortRule(e: React.FormEvent) {
    e.preventDefault()
    if (portForm.action === 'deny' && portForm.port === '22') {
      if (!confirm('Denying port 22 will lock you out via SSH. Are you absolutely sure?')) return
    }
    setSubmitting(true)
    setOutput(null)
    try {
      const result = await apiFetch<{ output: string }>('/api/firewall/port', {
        method: 'POST',
        body: JSON.stringify(portForm),
      })
      setOutput(result.output)
      await fetchStatus()
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function applyIpRule(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setOutput(null)
    try {
      const result = await apiFetch<{ output: string }>('/api/firewall/ip', {
        method: 'POST',
        body: JSON.stringify(ipForm),
      })
      setOutput(result.output)
      await fetchStatus()
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteRule(index: number) {
    const ruleNumber = index + 1
    if (!confirm(`Delete rule #${ruleNumber}? This action takes effect immediately.`)) return
    setOutput(null)
    try {
      const result = await apiFetch<{ output: string }>(`/api/firewall/rules/${ruleNumber}`, { method: 'DELETE' })
      setOutput(result.output)
      await fetchStatus()
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Failed')
    }
  }

  const inputCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none'

  if (loading) return <div className="h-40 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />
  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${status?.active ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-sm font-medium">UFW is {status?.active ? 'active' : 'inactive'}</span>
        <button onClick={fetchStatus} className="ml-auto text-xs text-gray-400 hover:text-gray-200">Refresh</button>
      </div>

      {output && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="mb-1 text-xs font-medium text-gray-400">UFW output:</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">{output}</pre>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Port rule */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Port Rule</h2>
          <form onSubmit={applyPortRule} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400">Port</label>
                <input value={portForm.port} onChange={(e) => setPortForm({ ...portForm, port: e.target.value })} required placeholder="80" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="text-xs text-gray-400">Protocol</label>
                <select value={portForm.protocol} onChange={(e) => setPortForm({ ...portForm, protocol: e.target.value })} className={`${inputCls}`}>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="any">Any</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Action</label>
                <select value={portForm.action} onChange={(e) => setPortForm({ ...portForm, action: e.target.value })} className={`${inputCls}`}>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </div>
            </div>
            {portForm.action === 'deny' && portForm.port === '22' && (
              <p className="text-xs text-red-400">Warning: Denying SSH port 22 will lock you out.</p>
            )}
            <button type="submit" disabled={submitting} className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${portForm.action === 'allow' ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>
              {submitting ? 'Applying...' : `${portForm.action === 'allow' ? 'Allow' : 'Deny'} Port ${portForm.port || '...'}`}
            </button>
          </form>
        </div>

        {/* IP rule */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">IP Rule</h2>
          <form onSubmit={applyIpRule} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400">IP Address / CIDR</label>
                <input value={ipForm.ip} onChange={(e) => setIpForm({ ...ipForm, ip: e.target.value })} required placeholder="192.168.1.0/24" className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="text-xs text-gray-400">Action</label>
                <select value={ipForm.action} onChange={(e) => setIpForm({ ...ipForm, action: e.target.value })} className={`${inputCls}`}>
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={submitting} className={`w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${ipForm.action === 'allow' ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}>
              {submitting ? 'Applying...' : `${ipForm.action === 'allow' ? 'Allow' : 'Deny'} IP`}
            </button>
          </form>
        </div>
      </div>

      {/* Rules table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-300">Current Rules</h2>
        {status && status.rules.length === 0 ? (
          <p className="text-sm text-gray-500">No rules configured{!status.active ? ' (UFW is inactive)' : ''}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-800 bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">#</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">To</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-400">From</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-400">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {status?.rules.map((rule, i) => (
                  <tr key={i} className="hover:bg-gray-900">
                    <td className="px-4 py-3 text-gray-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs">{rule.to}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${rule.action.toUpperCase().includes('ALLOW') ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {rule.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{rule.from}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteRule(i)}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900"
                        title={rule.to.includes('22') ? 'Warning: SSH rule' : undefined}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
