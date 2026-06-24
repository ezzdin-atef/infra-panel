'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

interface SslCert {
  id: string
  domain: string
  domainId: string
  status: string
  certbotEmail: string | null
  issuedAt: string | null
  expiresAt: string | null
  lastRenewedAt: string | null
  daysUntilExpiry: number | null
}

interface Domain { id: string; domain: string; sslEnabled: boolean }

function StatusBadge({ status, days }: { status: string; days: number | null }) {
  if (status === 'active') {
    const color = days === null ? 'text-green-400 border-green-700 bg-green-900'
      : days < 14 ? 'text-yellow-400 border-yellow-700 bg-yellow-900'
      : 'text-green-400 border-green-700 bg-green-900'
    return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${color}`}>{status}{days !== null ? ` (${days}d)` : ''}</span>
  }
  const map: Record<string, string> = {
    pending: 'text-blue-400 border-blue-700 bg-blue-900',
    expired: 'text-red-400 border-red-700 bg-red-900',
    revoked: 'text-gray-400 border-gray-600 bg-gray-800',
    error: 'text-red-400 border-red-700 bg-red-900',
  }
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${map[status] ?? map['error']}`}>{status}</span>
}

export function SslCertificateList() {
  const [certs, setCerts] = useState<SslCert[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [issueForm, setIssueForm] = useState({ domainId: '', email: '' })
  const [issuing, setIssuing] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [certsData, domainsData] = await Promise.all([
        apiFetch<SslCert[]>('/api/ssl/certificates'),
        apiFetch<Array<{ domain: Domain }>>('/api/domains').then((rows) => rows.map((r) => r.domain)),
      ])
      setCerts(certsData)
      setDomains(domainsData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function issueCert(e: React.FormEvent) {
    e.preventDefault()
    setIssuing(true)
    setOutput(null)
    try {
      const result = await apiFetch<{ certbotOutput?: string }>('/api/ssl/certificates', {
        method: 'POST',
        body: JSON.stringify(issueForm),
      })
      setOutput(result.certbotOutput ?? 'Success')
      setShowIssueForm(false)
      setIssueForm({ domainId: '', email: '' })
      await fetchAll()
    } catch (e) {
      setOutput(e instanceof Error ? e.message : 'Failed')
    } finally {
      setIssuing(false)
    }
  }

  async function renewCert(id: string) {
    setActionId(id)
    setOutput(null)
    try {
      const result = await apiFetch<{ certbotOutput?: string }>(`/api/ssl/certificates/${id}/renew`, { method: 'POST' })
      setOutput(result.certbotOutput ?? 'Renewed')
      await fetchAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Renewal failed')
    } finally {
      setActionId(null)
    }
  }

  async function revokeCert(id: string) {
    if (!confirm('Revoke this certificate? SSL will be disabled for the domain.')) return
    setActionId(id)
    try {
      await apiFetch(`/api/ssl/certificates/${id}/revoke`, { method: 'POST' })
      await fetchAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setActionId(null)
    }
  }

  const issuedDomainIds = new Set(certs.map((c) => c.domainId))
  const availableDomains = domains.filter((d) => !issuedDomainIds.has(d.id))

  if (loading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />)}</div>
  if (error) return <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>

  return (
    <div className="space-y-4">
      {output && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="mb-1 text-xs font-medium text-gray-400">Certbot output:</p>
          <pre className="overflow-x-auto text-xs text-gray-300 whitespace-pre-wrap">{output}</pre>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setShowIssueForm(!showIssueForm)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Issue Certificate
        </button>
      </div>

      {showIssueForm && (
        <form onSubmit={issueCert} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Issue New Certificate</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Domain</label>
              <select value={issueForm.domainId} onChange={(e) => setIssueForm({ ...issueForm, domainId: e.target.value })} required className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none">
                <option value="">Select domain...</option>
                {availableDomains.map((d) => <option key={d.id} value={d.id}>{d.domain}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Email (for Let&apos;s Encrypt)</label>
              <input type="email" value={issueForm.email} onChange={(e) => setIssueForm({ ...issueForm, email: e.target.value })} required placeholder="admin@example.com" className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={issuing} className="rounded-md bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-600 disabled:opacity-50">{issuing ? 'Issuing (this may take a minute)...' : 'Issue'}</button>
            <button type="button" onClick={() => setShowIssueForm(false)} className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800">Cancel</button>
          </div>
        </form>
      )}

      {certs.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 py-16 text-center">
          <p className="text-gray-400">No SSL certificates yet</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Domain</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Issued</th>
                <th className="px-4 py-3 text-left font-medium text-gray-400">Expires</th>
                <th className="px-4 py-3 text-right font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {certs.map((c) => {
                const busy = actionId === c.id
                return (
                  <tr key={c.id} className="hover:bg-gray-900">
                    <td className="px-4 py-3 font-medium">{c.domain}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} days={c.daysUntilExpiry} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400">{c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {c.status === 'active' && (
                          <button onClick={() => renewCert(c.id)} disabled={busy} className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900 disabled:opacity-40">Renew</button>
                        )}
                        {c.status === 'active' && (
                          <button onClick={() => revokeCert(c.id)} disabled={busy} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900 disabled:opacity-40">Revoke</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
