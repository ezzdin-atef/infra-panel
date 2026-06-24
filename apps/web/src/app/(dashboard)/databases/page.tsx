import { ServerList } from '@/components/databases/server-list'

export default function DatabasesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Databases</h1>
        <p className="text-sm text-gray-400">Manage PostgreSQL servers and databases</p>
      </div>
      <ServerList />
    </div>
  )
}
