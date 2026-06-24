'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docker', label: 'Docker' },
  { href: '/applications', label: 'Applications' },
  { href: '/domains', label: 'Domains' },
  { href: '/ssl', label: 'SSL' },
  { href: '/databases', label: 'Databases' },
  { href: '/backups', label: 'Backups' },
  { href: '/firewall', label: 'Firewall' },
  { href: '/settings', label: 'Settings' },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="flex w-56 flex-col border-r border-gray-800 bg-gray-900 p-4">
      <div className="mb-8">
        <span className="text-lg font-semibold">Infra Panel</span>
      </div>
      <ul className="flex-1 space-y-1">
        {navItems.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
