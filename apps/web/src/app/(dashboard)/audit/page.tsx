import { AuditLogViewer } from '@/components/audit/audit-log-viewer'

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="text-sm text-gray-400">Track all actions performed in the panel</p>
      </div>
      <AuditLogViewer />
    </div>
  )
}
