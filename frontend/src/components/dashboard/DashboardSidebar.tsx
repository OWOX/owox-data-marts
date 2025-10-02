'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'
import { 
  HomeIcon, 
  CloudArrowUpIcon, 
  ChartBarIcon, 
  CogIcon,
  LockClosedIcon,
  CircleStackIcon,
  LinkIcon,
  TableCellsIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline'

import { clsx } from 'clsx'

// Use correct icon names
const KeyIcon = LockClosedIcon // For Platform Credentials
const DatabaseIcon = CircleStackIcon // For Storage Destinations
const DataMartIcon = TableCellsIcon // For Data Marts
const DataBrowserIcon = MagnifyingGlassIcon // For Data Browser

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Platform Credentials', href: '/dashboard/credentials', icon: KeyIcon },
  { name: 'Connectors', href: '/dashboard/connectors', icon: LinkIcon },
  { name: 'Storage Destinations', href: '/dashboard/storage', icon: DatabaseIcon },
  { name: 'Data Marts', href: '/dashboard/data-marts', icon: DataMartIcon },
  { name: 'Data Collections', href: '/dashboard/collections', icon: CloudArrowUpIcon },
  { name: 'Data Browser', href: '/dashboard/data-browser', icon: DataBrowserIcon },
  { name: 'Reports', href: '/dashboard/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/dashboard/settings', icon: CogIcon },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const { isCollapsed, toggleSidebar } = useSidebar()

  return (
    <div 
      className={clsx(
        'fixed inset-y-0 left-0 z-50 bg-white shadow-lg transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
        {!isCollapsed && (
          <h1 className="text-xl font-bold text-gray-900">FSSC Data Marts</h1>
        )}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </button>
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
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                    isCollapsed && 'justify-center'
                  )}
                  title={isCollapsed ? item.name : undefined}
                >
                  <item.icon
                    className={clsx(
                      'h-5 w-5 flex-shrink-0',
                      isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500',
                      !isCollapsed && 'mr-3'
                    )}
                  />
                  {!isCollapsed && (
                    <span className="truncate">{item.name}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
