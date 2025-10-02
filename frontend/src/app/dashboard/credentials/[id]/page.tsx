'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from 'react-query'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { apiClient } from '@/lib/api/client'
import { getPlatformInfo } from '@/lib/platforms'
import { 
  ArrowLeftIcon,
  LockClosedIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  PencilIcon,
  CircleStackIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline'

interface LinkedInAccount {
  id: string
  name: string
  status: string
  currency: string
  type: string
}

export default function CredentialDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const credentialId = parseInt(params.id)

  const { data: credential, isLoading } = useQuery(
    ['platform-credential', credentialId],
    () => platformCredentialsApi.getById(credentialId)
  )

  const { data: accounts = [], isLoading: accountsLoading } = useQuery(
    ['linkedin-accounts', credentialId],
    async () => {
      const response = await apiClient.get(`/platforms/linkedin/credentials/${credentialId}/accounts`)
      return response.data
    },
    {
      enabled: !!credential && credential.platform_name === 'linkedin'
    }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!credential) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Credential not found</h3>
        <p className="text-gray-500 mt-2">The requested credential could not be found.</p>
        <Link href="/dashboard/credentials" className="btn-primary mt-4">
          Back to Credentials
        </Link>
      </div>
    )
  }

  const platformInfo = getPlatformInfo(credential.platform_name)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="text-3xl">{platformInfo?.icon || '🔗'}</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {credential.platform_display_name}
              </h1>
              <p className="text-gray-600">{credential.account_name}</p>
            </div>
          </div>
        </div>
        <Link
          href={`/dashboard/credentials/${credential.id}/edit`}
          className="btn-primary"
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Edit Credential
        </Link>
      </div>

      {/* Credential Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Credential Information</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div className="flex items-center space-x-3">
                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Platform</span>
                  </div>
                  <span className="text-sm text-gray-900">{credential.platform_display_name}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <div className="flex items-center space-x-3">
                    <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Account Name</span>
                  </div>
                  <span className="text-sm text-gray-900">{credential.account_name}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Status</span>
                  <div className="flex items-center space-x-2">
                    {credential.is_valid ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                    )}
                    <span className={`text-sm font-medium ${
                      credential.is_active ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {credential.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Validation Status</span>
                  <span className={`text-sm font-medium ${
                    credential.is_valid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {credential.is_valid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                
                {credential.last_validated_at && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Last Validated</span>
                    <span className="text-sm text-gray-900">
                      {new Date(credential.last_validated_at).toLocaleString()}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-gray-700">Created</span>
                  <span className="text-sm text-gray-900">
                    {new Date(credential.created_at).toLocaleString()}
                  </span>
                </div>
                
                {credential.validation_error && (
                  <div className="mt-4 p-4 bg-red-50 rounded-md">
                    <h4 className="text-sm font-medium text-red-800 mb-2">Validation Error</h4>
                    <p className="text-sm text-red-600">{credential.validation_error}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Stats */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Credential ID</span>
                  <span className="text-sm font-mono text-gray-900">{credential.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Platform</span>
                  <span className="text-sm text-gray-900">{credential.platform_name}</span>
                </div>
                {accounts.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Connected Accounts</span>
                    <span className="text-sm font-medium text-primary-600">{accounts.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      {credential.platform_name === 'linkedin' && (
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <CircleStackIcon className="mr-2 h-5 w-5" />
              Connected LinkedIn Ad Accounts
            </h3>
            
            {accountsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
              </div>
            ) : accounts.length > 0 ? (
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Account
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Currency
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {accounts.map((account: LinkedInAccount) => (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{account.name}</div>
                            <div className="text-sm text-gray-500">ID: {account.id}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            account.status === 'ACTIVE' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {account.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {account.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {account.type}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <CircleStackIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No LinkedIn ad accounts are associated with this credential.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
