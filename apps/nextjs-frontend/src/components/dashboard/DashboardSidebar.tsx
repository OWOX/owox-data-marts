'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  CloudArrowUpIcon, 
  ChartBarIcon, 
  CogIcon,
  KeyIcon,
  DatabaseIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Platform Credentials', href: '/dashboard/credentials', icon: KeyIcon },
  { name: 'Data Marts', href: '/dashboard/data-marts', icon: DatabaseIcon },
  { name: 'Data Collections', href: '/dashboard/collections', icon: CloudArrowUpIcon },
  { name: 'Reports', href: '/dashboard/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">OWOX Data Marts</h1>
      </div>
      
      <nav className="mt-6 px-3">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={clsx(
                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
