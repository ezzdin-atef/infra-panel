import { SettingsPanel } from '@/components/settings/settings-panel'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-400">Manage server configuration and security</p>
      </div>
      <SettingsPanel />
    </div>
  )
}
