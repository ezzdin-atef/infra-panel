import { CreateApplicationForm } from '@/components/applications/create-application-form'

export default function NewApplicationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Application</h1>
        <p className="text-sm text-gray-400">Deploy a new containerized application</p>
      </div>
      <CreateApplicationForm />
    </div>
  )
}
