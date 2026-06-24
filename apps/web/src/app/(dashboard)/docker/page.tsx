import { ContainerList } from '@/components/docker/container-list'

export default function DockerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Docker</h1>
        <p className="text-sm text-gray-400">Manage containers, images, networks, and volumes</p>
      </div>
      <ContainerList />
    </div>
  )
}
