import { CreateDomainForm } from '@/components/domains/create-domain-form'

export default function NewDomainPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Domain</h1>
        <p className="text-sm text-gray-400">Configure a new reverse proxy domain</p>
      </div>
      <CreateDomainForm />
    </div>
  )
}
