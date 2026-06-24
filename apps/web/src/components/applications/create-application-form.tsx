'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

interface PortMapping { host: string; container: string; protocol: string }
interface EnvVar { key: string; value: string; isSecret: boolean }

export function CreateApplicationForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ports, setPorts] = useState<PortMapping[]>([])
  const [envVars, setEnvVars] = useState<EnvVar[]>([])

  function addPort() { setPorts([...ports, { host: '', container: '', protocol: 'tcp' }]) }
  function removePort(i: number) { setPorts(ports.filter((_, idx) => idx !== i)) }
  function updatePort(i: number, field: keyof PortMapping, val: string) {
    setPorts(ports.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  function addEnv() { setEnvVars([...envVars, { key: '', value: '', isSecret: false }]) }
  function removeEnv(i: number) { setEnvVars(envVars.filter((_, idx) => idx !== i)) }
  function updateEnv(i: number, field: keyof EnvVar, val: string | boolean) {
    setEnvVars(envVars.map((e, idx) => idx === i ? { ...e, [field]: val } : e))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const payload = {
      name: fd.get('name') as string,
      image: fd.get('image') as string,
      restartPolicy: fd.get('restartPolicy') as string,
      ports: ports.filter(p => p.host && p.container).map(p => ({
        host: parseInt(p.host, 10),
        container: parseInt(p.container, 10),
        protocol: p.protocol,
      })),
      envVars: envVars.filter(e => e.key),
    }

    try {
      const app = await apiFetch<{ id: string }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      router.push(`/applications/${app.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create application')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && <div className="rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Basic Info</h2>
        <Field label="App Name" hint="Lowercase letters, numbers, hyphens">
          <input name="name" required pattern="[a-z0-9_-]+" className={inputCls} placeholder="my-app" />
        </Field>
        <Field label="Docker Image">
          <input name="image" required className={inputCls} placeholder="nginx:latest" />
        </Field>
        <Field label="Restart Policy">
          <select name="restartPolicy" className={inputCls} defaultValue="unless-stopped">
            <option value="no">No</option>
            <option value="always">Always</option>
            <option value="unless-stopped">Unless Stopped</option>
            <option value="on-failure">On Failure</option>
          </select>
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Port Mappings</h2>
          <button type="button" onClick={addPort} className="text-xs text-blue-400 hover:underline">+ Add Port</button>
        </div>
        {ports.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input type="number" placeholder="Host port" value={p.host} onChange={(e) => updatePort(i, 'host', e.target.value)} className={`${inputCls} w-28`} />
            <span className="self-center text-gray-600">:</span>
            <input type="number" placeholder="Container port" value={p.container} onChange={(e) => updatePort(i, 'container', e.target.value)} className={`${inputCls} w-36`} />
            <select value={p.protocol} onChange={(e) => updatePort(i, 'protocol', e.target.value)} className={`${inputCls} w-20`}>
              <option>tcp</option>
              <option>udp</option>
            </select>
            <button type="button" onClick={() => removePort(i)} className="text-red-400 hover:text-red-300">x</button>
          </div>
        ))}
        {ports.length === 0 && <p className="text-xs text-gray-500">No port mappings</p>}
      </div>

      <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Environment Variables</h2>
          <button type="button" onClick={addEnv} className="text-xs text-blue-400 hover:underline">+ Add Variable</button>
        </div>
        {envVars.map((ev, i) => (
          <div key={i} className="flex gap-2">
            <input placeholder="KEY" value={ev.key} onChange={(e) => updateEnv(i, 'key', e.target.value.toUpperCase())} className={`${inputCls} w-36 font-mono uppercase`} />
            <input
              placeholder="value"
              type={ev.isSecret ? 'password' : 'text'}
              value={ev.value}
              onChange={(e) => updateEnv(i, 'value', e.target.value)}
              className={`${inputCls} flex-1 font-mono`}
            />
            <label className="flex items-center gap-1 text-xs text-gray-400">
              <input type="checkbox" checked={ev.isSecret} onChange={(e) => updateEnv(i, 'isSecret', e.target.checked)} className="accent-blue-500" />
              Secret
            </label>
            <button type="button" onClick={() => removeEnv(i)} className="text-red-400 hover:text-red-300">x</button>
          </div>
        ))}
        {envVars.length === 0 && <p className="text-xs text-gray-500">No environment variables</p>}
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Deploying...' : 'Deploy Application'}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded-md border border-gray-700 px-6 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800">
          Cancel
        </button>
      </div>
    </form>
  )
}

const inputCls = 'rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none w-full'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}
