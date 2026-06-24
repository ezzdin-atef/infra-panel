import { MetricsDashboard } from '@/components/dashboard/metrics-dashboard'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-400">Server overview</p>
      </div>
      <MetricsDashboard />
    </div>
  )
}
