'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { getPlatformInfo } from '@/lib/platforms'
import { 
  PlusIcon, 
  LockClosedIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  TrashIcon,
  PencilIcon
} from '@heroicons/react/24/outline'

import toast from 'react-hot-toast'

// Use correct icon name
const KeyIcon = LockClosedIcon

export default function CredentialsPage() {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const queryClient = useQueryClient()
  
  const { data: credentials = [], isLoading } = useQuery(
    'platform-credentials',
    platformCredentialsApi.getAll
  )

  const deleteMutation = useMutation(platformCredentialsApi.delete, {
    onSuccess: () => {
      queryClient.invalidateQueries('platform-credentials')
      toast.success('Platform credential deleted successfully')
      setDeletingId(null)
    },
    onError: () => {
      toast.error('Failed to delete platform credential')
      setDeletingId(null)
    }
  })

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this platform credential?')) {
      setDeletingId(id)
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Credentials</h1>
          <p className="text-gray-600">Manage your platform API credentials and connections</p>
        </div>
        <Link href="/dashboard/credentials/new" className="btn-primary">
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Credentials
        </Link>
      </div>

      {credentials.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No platform credentials</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding credentials for your first platform.
            </p>
            <div className="mt-6">
              <Link href="/dashboard/credentials/new" className="btn-primary">
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Platform Credentials
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((credential) => {
            const platformInfo = getPlatformInfo(credential.platform_name)
            return (
              <div key={credential.id} className="card hover:shadow-md transition-shadow">
                <Link href={`/dashboard/credentials/${credential.id}`}>
                  <div className="card-body cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{platformInfo?.icon || '🔗'}</div>
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">
                            {credential.platform_display_name}
                          </h3>
                          <p className="text-sm text-gray-500">{credential.account_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {credential.is_valid ? (
                          <CheckCircleIcon className="h-5 w-5 text-green-500" title="Valid" />
                        ) : (
                          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" title="Invalid" />
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Status:</span>
                        <span className={`font-medium ${
                          credential.is_active ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          {credential.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      {credential.last_validated_at && (
                        <div className="flex items-center justify-between text-sm mt-1">
                          <span className="text-gray-500">Last validated:</span>
                          <span className="text-gray-600">
                            {new Date(credential.last_validated_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      
                      {credential.validation_error && (
                        <div className="mt-2 p-2 bg-red-50 rounded-md">
                          <p className="text-xs text-red-600">{credential.validation_error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
                
                <div className="card-body pt-0">
                  <div className="flex justify-between">
                    <Link 
                      href={`/dashboard/credentials/${credential.id}/edit`}
                      className="btn-outline text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PencilIcon className="mr-1 h-4 w-4" />
                      Edit
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(credential.id)
                      }}
                      disabled={deletingId === credential.id}
                      className="btn-outline text-sm text-red-600 border-red-300 hover:bg-red-50"
                    >
                      {deletingId === credential.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      ) : (
                        <>
                          <TrashIcon className="mr-1 h-4 w-4" />
                          Delete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
