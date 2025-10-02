'use client'

import Link from 'next/link'
import { useQuery } from 'react-query'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { 
  LockClosedIcon, 
  CircleStackIcon, 
  CloudArrowUpIcon, 
  ChartBarIcon,
  PlusIcon
} from '@heroicons/react/24/outline'

// Use correct icon names
const KeyIcon = LockClosedIcon // For Platform Credentials
const DatabaseIcon = CircleStackIcon // For Data Marts

export default function DashboardPage() {
  const { data: credentials = [], isLoading } = useQuery(
    'platform-credentials',
    platformCredentialsApi.getAll
  )

  const stats = [
    {
      name: 'Platform Credentials',
      value: credentials.length,
      icon: KeyIcon,
      href: '/dashboard/credentials',
      color: 'bg-blue-500'
    },
    {
      name: 'Data Marts',
      value: 0, // TODO: Implement data marts count
      icon: DatabaseIcon,
      href: '/dashboard/data-marts',
      color: 'bg-green-500'
    },
    {
      name: 'Active Collections',
      value: 0, // TODO: Implement collections count
      icon: CloudArrowUpIcon,
      href: '/dashboard/collections',
      color: 'bg-yellow-500'
    },
    {
      name: 'Reports',
      value: 0, // TODO: Implement reports count
      icon: ChartBarIcon,
      href: '/dashboard/reports',
      color: 'bg-purple-500'
    },
  ]

  const quickActions = [
    {
      name: 'Add Platform Credentials',
      description: 'Connect to Facebook Ads, LinkedIn, TikTok, and more',
      href: '/dashboard/credentials/new',
      icon: KeyIcon,
      color: 'bg-blue-500'
    },
    {
      name: 'Create Data Mart',
      description: 'Set up a new data collection and processing pipeline',
      href: '/dashboard/data-marts/new',
      icon: DatabaseIcon,
      color: 'bg-green-500'
    },
    {
      name: 'Start Data Collection',
      description: 'Begin collecting data from your connected platforms',
      href: '/dashboard/collections/new',
      icon: CloudArrowUpIcon,
      color: 'bg-yellow-500'
    },
  ]

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Overview</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link key={stat.name} href={stat.href}>
              <div className="card hover:shadow-md transition-shadow cursor-pointer">
                <div className="card-body">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className={`p-3 rounded-md ${stat.color}`}>
                        <stat.icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {isLoading ? '...' : stat.value}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.name} href={action.href}>
              <div className="card hover:shadow-md transition-shadow cursor-pointer">
                <div className="card-body">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className={`p-3 rounded-md ${action.color}`}>
                        <action.icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-medium text-gray-900">{action.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                      <div className="mt-3">
                        <span className="inline-flex items-center text-sm font-medium text-primary-600">
                          Get started
                          <PlusIcon className="ml-1 h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
        <div className="card">
          <div className="card-body">
            <div className="text-center py-8">
              <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No recent activity</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by connecting your first platform or creating a data mart.
              </p>
              <div className="mt-6">
                <Link href="/dashboard/credentials/new" className="btn-primary">
                  <PlusIcon className="mr-2 h-4 w-4" />
                  Add Platform Credentials
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
