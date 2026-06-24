'use client'

import { useEffect, useState, useCallback } from 'react'

interface MetricsSnapshot {
  cpu: { usage: number; cores: number }
  memory: { total: number; used: number; free: number; usagePercent: number }
  disk: { total: number; used: number; free: number; usagePercent: number }
  uptime: { seconds: number; bootTime: number }
  load: { avg1: number; avg5: number; avg15: number }
  network: Array<{ iface: string; rxSec: number; txSec: number }>
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
  return (bytes / 1e3).toFixed(1) + ' KB'
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function ProgressBar({ value, color = 'blue' }: { value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }
  const bar = value > 85 ? 'red' : value > 65 ? 'yellow' : color
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorMap[bar] ?? colorMap['blue']}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

function MetricCard({
  label,
  value,
  sub,
  percent,
}: {
  label: string
  value: string
  sub: string
  percent?: number
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
      {percent !== undefined && <ProgressBar value={percent} />}
    </div>
  )
}

export function MetricsDashboard() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/metrics/snapshot`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        }
      )
      if (!res.ok) throw new Error('Failed to fetch metrics')
      const data = await res.json() as MetricsSnapshot
      setMetrics(data)
      setError(null)
    } catch {
      setError('Could not reach the API')
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
    const id = setInterval(fetchMetrics, 5000)
    return () => clearInterval(id)
  }, [fetchMetrics])

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
        {error}
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-gray-800 bg-gray-900" />
        ))}
      </div>
    )
  }

  const netPrimary = metrics.network[0]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="CPU"
          value={`${metrics.cpu.usage}%`}
          sub={`${metrics.cpu.cores} cores`}
          percent={metrics.cpu.usage}
        />
        <MetricCard
          label="Memory"
          value={`${metrics.memory.usagePercent}%`}
          sub={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
          percent={metrics.memory.usagePercent}
        />
        <MetricCard
          label="Disk"
          value={`${metrics.disk.usagePercent}%`}
          sub={`${formatBytes(metrics.disk.used)} / ${formatBytes(metrics.disk.total)}`}
          percent={metrics.disk.usagePercent}
        />
        <MetricCard
          label="Uptime"
          value={formatUptime(metrics.uptime.seconds)}
          sub="since last boot"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-gray-300">System Load</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">1 min avg</span>
              <span className="font-mono">{metrics.load.avg1.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-3 text-sm font-medium text-gray-300">Network</h2>
          {netPrimary ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">{netPrimary.iface} RX</span>
                <span className="font-mono">{formatBytes(netPrimary.rxSec)}/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">{netPrimary.iface} TX</span>
                <span className="font-mono">{formatBytes(netPrimary.txSec)}/s</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No network data</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-1 text-sm font-medium text-gray-300">Active Services</h2>
          <p className="text-xs text-gray-500">Available in Phase 11</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-1 text-sm font-medium text-gray-300">Backups</h2>
          <p className="text-xs text-gray-500">Available in Phase 9</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="mb-1 text-sm font-medium text-gray-300">SSL Certificates</h2>
          <p className="text-xs text-gray-500">Available in Phase 7</p>
        </div>
      </div>
    </div>
  )
}
