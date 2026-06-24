import { BackupDashboard } from '@/components/backups/backup-dashboard'

export default function BackupsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Backups</h1>
        <p className="text-sm text-gray-400">Schedule and manage PostgreSQL backups</p>
      </div>
      <BackupDashboard />
    </div>
  )
}
