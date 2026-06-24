import { ApplicationList } from '@/components/applications/application-list'

export default function ApplicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="text-sm text-gray-400">Manage your deployed applications</p>
      </div>
      <ApplicationList />
    </div>
  )
}
