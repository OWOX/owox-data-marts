'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { storageApi } from '@/lib/api/storage'
import { StorageDestination, StorageType } from '@/types/storage'
import { 
  PlusIcon,
  CircleStackIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  PlayIcon,
  DocumentChartBarIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const getStorageTypeIcon = (type: StorageType) => {
  switch (type) {
    case StorageType.CSV:
      return '📄'
    case StorageType.POSTGRES:
      return '🐘'
    case StorageType.BIGQUERY:
      return '📊'
    case StorageType.SHEETS:
      return '📋'
    case StorageType.ATHENA:
      return '☁️'
    default:
      return '💾'
  }
}

const getStorageTypeName = (type: StorageType) => {
  switch (type) {
    case StorageType.CSV:
      return 'CSV File'
    case StorageType.POSTGRES:
      return 'PostgreSQL'
    case StorageType.BIGQUERY:
      return 'BigQuery'
    case StorageType.SHEETS:
      return 'Google Sheets'
    case StorageType.ATHENA:
      return 'AWS Athena'
    default:
      return type
  }
}

export default function StorageDestinationsPage() {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<StorageType | 'all'>('all')
  const queryClient = useQueryClient()
  
  const { data: destinations = [], isLoading } = useQuery(
    ['storage-destinations', filterType],
    () => filterType === 'all' 
      ? storageApi.getDestinations()
      : storageApi.getDestinationsByType(filterType as StorageType)
  )

  const { data: storageTypes = [] } = useQuery(
    'storage-types',
    storageApi.getSupportedTypes
  )

  const deleteMutation = useMutation(storageApi.deleteDestination, {
    onSuccess: () => {
      queryClient.invalidateQueries('storage-destinations')
      toast.success('Storage destination deleted successfully')
      setDeletingId(null)
    },
    onError: () => {
      toast.error('Failed to delete storage destination')
      setDeletingId(null)
    }
  })

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this storage destination? This action cannot be undone.')) {
      setDeletingId(id)
      deleteMutation.mutate(id)
    }
  }

  const filteredDestinations = destinations.filter(dest => 
    filterType === 'all' || dest.storage_type === filterType
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Storage Destinations</h1>
          <p className="text-gray-600">Manage data storage destinations and monitor execution status</p>
        </div>
        <Link href="/dashboard/storage/new" className="btn-primary">
          <PlusIcon className="mr-2 h-4 w-4" />
          Add Destination
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Filter by type:</label>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as StorageType | 'all')}
          className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All Types</option>
          {storageTypes.map((type) => (
            <option key={type.type} value={type.type}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      {/* Storage Destinations Grid */}
      {filteredDestinations.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <CircleStackIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {filterType === 'all' ? 'No storage destinations' : `No ${getStorageTypeName(filterType as StorageType)} destinations`}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first storage destination.
            </p>
            <div className="mt-6">
              <Link href="/dashboard/storage/new" className="btn-primary">
                <PlusIcon className="mr-2 h-4 w-4" />
                Add Storage Destination
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDestinations.map((destination) => (
            <div key={destination.id} className="card hover:shadow-md transition-shadow">
              <div className="card-body">
                {/* Main Content - Clickable */}
                <Link href={`/dashboard/storage/${destination.id}`} className="block cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-2xl">{getStorageTypeIcon(destination.storage_type)}</div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {destination.name}
                        </h3>
                        <p className="text-sm text-gray-500">{getStorageTypeName(destination.storage_type)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {destination.is_active ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" title="Active" />
                      ) : (
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-500" title="Inactive" />
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Status:</span>
                      <span className={`font-medium ${
                        destination.is_active ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {destination.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500">Unique Keys:</span>
                      <span className="text-gray-600 text-xs">
                        {destination.unique_key_columns?.length > 0 
                          ? destination.unique_key_columns.join(', ') 
                          : 'None'
                        }
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500">Created:</span>
                      <span className="text-gray-600">
                        {new Date(destination.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    
                    {destination.description && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-md">
                        <p className="text-xs text-gray-600">{destination.description}</p>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    {/* First row */}
                    <Link 
                      href={`/dashboard/storage/${destination.id}`}
                      className="btn-outline text-xs flex items-center justify-center"
                      title="View Details"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EyeIcon className="h-3 w-3 mr-1" />
                      View
                    </Link>
                    <Link 
                      href={`/dashboard/storage/${destination.id}/metrics`}
                      className="btn-outline text-xs flex items-center justify-center"
                      title="View Metrics"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DocumentChartBarIcon className="h-3 w-3 mr-1" />
                      Metrics
                    </Link>
                    
                    {/* Second row */}
                    <Link 
                      href={`/dashboard/storage/${destination.id}/edit`}
                      className="btn-outline text-xs flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PencilIcon className="h-3 w-3 mr-1" />
                      Edit
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(destination.id)
                      }}
                      disabled={deletingId === destination.id}
                      className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center"
                    >
                      {deletingId === destination.id ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                      ) : (
                        <>
                          <TrashIcon className="h-3 w-3 mr-1" />
                          Delete
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      {destinations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CircleStackIcon className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Destinations</dt>
                  <dd className="text-lg font-medium text-gray-900">{destinations.length}</dd>
                </dl>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-8 w-8 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {destinations.filter(d => d.is_active).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl">📄</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">CSV Files</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {destinations.filter(d => d.storage_type === StorageType.CSV).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-2xl">🐘</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">PostgreSQL</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {destinations.filter(d => d.storage_type === StorageType.POSTGRES).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
