import { FirewallManager } from '@/components/firewall/firewall-manager'

export default function FirewallPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Firewall</h1>
        <p className="text-sm text-gray-400">Manage UFW firewall rules</p>
      </div>
      <FirewallManager />
    </div>
  )
}
