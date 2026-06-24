import { VolumeList } from '@/components/docker/volume-list'

export default function VolumesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Volumes</h1>
        <p className="text-sm text-gray-400">Manage Docker volumes</p>
      </div>
      <VolumeList />
    </div>
  )
}
