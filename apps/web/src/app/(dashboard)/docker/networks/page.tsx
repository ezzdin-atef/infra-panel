import { NetworkList } from '@/components/docker/network-list'

export default function NetworksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Networks</h1>
        <p className="text-sm text-gray-400">Manage Docker networks</p>
      </div>
      <NetworkList />
    </div>
  )
}
