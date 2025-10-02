'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { 
  ArrowLeftIcon,
  CloudArrowDownIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CircleStackIcon,
  PlayIcon
} from '@heroicons/react/24/outline'
import { dataCollectionApi } from '@/lib/api'
import { storageApi } from '@/lib/api/storage'
import { CollectionJob } from '@/types/collections'
import { StorageDestination } from '@/types/storage'
import toast from 'react-hot-toast'

export default function CollectionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const collectionId = params.id as string

  const [selectedDestination, setSelectedDestination] = useState<string>('')
  const [showExportModal, setShowExportModal] = useState(false)

  // Fetch collection details
  const { data: collection, isLoading: loadingCollection } = useQuery(
    ['collection', collectionId],
    () => dataCollectionApi.getCollection(collectionId),
    {
      enabled: !!collectionId,
      onError: (error: any) => {
        console.error('Failed to fetch collection:', error)
        toast.error('Failed to load collection details')
      }
    }
  )

  // Fetch available storage destinations
  const { data: destinations = [] } = useQuery(
    'storage-destinations',
    storageApi.getDestinations
  )

  // Export to storage destination mutation
  const exportMutation = useMutation(
    (destinationId: string) => dataCollectionApi.exportToDestination(collectionId, destinationId),
    {
      onSuccess: () => {
        toast.success('Data export started successfully')
        setShowExportModal(false)
        queryClient.invalidateQueries(['collection', collectionId])
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.detail || 'Failed to export data')
      }
    }
  )

  const handleExport = () => {
    if (!selectedDestination) {
      toast.error('Please select a storage destination')
      return
    }
    exportMutation.mutate(selectedDestination)
  }

  if (loadingCollection) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Collection not found</h2>
        <p className="text-gray-600 mt-2">The requested collection does not exist.</p>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="btn-outline flex items-center"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{collection.collection_name}</h1>
            <p className="text-gray-600">Collection Details</p>
          </div>
        </div>
        
        {collection.status === 'completed' && collection.records_collected > 0 && (
          <button
            onClick={() => setShowExportModal(true)}
            className="btn-primary flex items-center"
          >
            <CircleStackIcon className="h-4 w-4 mr-2" />
            Export to Storage
          </button>
        )}
      </div>

      {/* Collection Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Status</p>
                <div className="flex items-center mt-1">
                  {getStatusIcon(collection.status)}
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(collection.status)}`}>
                    {collection.status.charAt(0).toUpperCase() + collection.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div>
              <p className="text-sm font-medium text-gray-600">Records Collected</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {collection.records_collected?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div>
              <p className="text-sm font-medium text-gray-600">Records Failed</p>
              <p className="text-2xl font-bold text-red-600 mt-1">
                {collection.records_failed?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div>
              <p className="text-sm font-medium text-gray-600">Progress</p>
              <div className="mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{collection.progress_percentage || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div 
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${collection.progress_percentage || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collection Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Collection Info</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Platform:</span>
                <span className="text-sm font-medium text-gray-900">{collection.platform_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Started:</span>
                <span className="text-sm text-gray-900">
                  {collection.started_at ? new Date(collection.started_at).toLocaleString() : 'Not started'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed:</span>
                <span className="text-sm text-gray-900">
                  {collection.completed_at ? new Date(collection.completed_at).toLocaleString() : 'Not completed'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Created:</span>
                <span className="text-sm text-gray-900">
                  {new Date(collection.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Collection Parameters</h3>
            {collection.collection_params ? (
              <div className="space-y-2">
                {Object.entries(collection.collection_params).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>
                    <span className="text-sm text-gray-900">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No parameters available</p>
            )}
          </div>
        </div>
      </div>

      {/* Error Details */}
      {collection.status === 'failed' && collection.error_message && (
        <div className="card border-red-200 bg-red-50">
          <div className="card-body">
            <h3 className="text-lg font-medium text-red-900 mb-2">Error Details</h3>
            <p className="text-sm text-red-700">{collection.error_message}</p>
            {collection.error_details && (
              <details className="mt-3">
                <summary className="text-sm font-medium text-red-800 cursor-pointer">
                  View Technical Details
                </summary>
                <pre className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded overflow-x-auto">
                  {JSON.stringify(collection.error_details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Export to Storage Destination
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Storage Destination
                </label>
                <select
                  value={selectedDestination}
                  onChange={(e) => setSelectedDestination(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="">Choose a destination...</option>
                  {destinations.map((dest) => (
                    <option key={dest.id} value={dest.id}>
                      {dest.name} ({dest.storage_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-sm text-gray-600 mb-4">
                This will export {collection.records_collected.toLocaleString()} records 
                to the selected storage destination.
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleExport}
                  disabled={exportMutation.isLoading || !selectedDestination}
                  className="btn-primary flex items-center"
                >
                  {exportMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <PlayIcon className="h-4 w-4 mr-2" />
                  )}
                  Export Data
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="btn-outline"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
