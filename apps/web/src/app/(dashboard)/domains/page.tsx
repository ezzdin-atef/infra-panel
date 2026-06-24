import { DomainList } from '@/components/domains/domain-list'

export default function DomainsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Domains</h1>
        <p className="text-sm text-gray-400">Manage Nginx reverse proxy domains</p>
      </div>
      <DomainList />
    </div>
  )
}
