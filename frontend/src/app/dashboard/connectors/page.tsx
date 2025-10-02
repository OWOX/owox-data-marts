'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { 
  PlusIcon, 
  PlayIcon, 
  PauseIcon, 
  CogIcon, 
  ChartBarIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon,
  ArrowRightIcon,
  TrashIcon,
  EyeIcon,
  PencilIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { dataConnectorsApi, dataCollectionApi, exportsApi } from '@/lib/api'
import { storageApi } from '@/lib/api/storage'
import toast from 'react-hot-toast'

interface DataConnector {
  id: string
  name: string
  description?: string
  source_collection_id: string
  source_collection_name: string
  destination_id: string  
  destination_name: string
  destination_type: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'paused'
  is_active: boolean
  last_execution_at?: string
  created_at: string
  records_transferred?: number
  success_rate?: number
  csv_filename?: string  // For CSV downloads
  error_message?: string  // For failed transfers
}

interface NewConnectorForm {
  name: string
  description: string
  source_collection_id: string
  destination_id: string
}

interface DeleteModalState {
  isOpen: boolean
  connector: DataConnector | null
}

export default function ConnectorsPage() {
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [showNewConnector, setShowNewConnector] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    connector: null
  })
  const [formData, setFormData] = useState<NewConnectorForm>({
    name: '',
    description: '',
    source_collection_id: '',
    destination_id: ''
  })
  const queryClient = useQueryClient()

  // Fetch connectors
  const { data: connectors = [], isLoading: loadingConnectors } = useQuery(
    ['data-connectors', selectedFilter],
    () => dataConnectorsApi.getAll(selectedFilter),
    {
      onError: (error: any) => {
        console.error('Failed to fetch connectors:', error)
        // Don't show error toast for now since this is new functionality
      }
    }
  )

  // Fetch collections for source selection
  const { data: collections = [] } = useQuery(
    'data-collections-for-connectors',
    () => dataCollectionApi.getRecent(),
    {
      select: (data: any) => data.data?.filter((c: any) => c.status === 'completed' && c.records_collected > 0) || []
    }
  )

  // Fetch destinations for target selection  
  const { data: destinations = [] } = useQuery(
    'storage-destinations-for-connectors',
    storageApi.getDestinations
  )

  // Create connector mutation
  const createMutation = useMutation(dataConnectorsApi.create, {
    onSuccess: () => {
      toast.success('Connector created successfully')
      setShowNewConnector(false)
      setFormData({ name: '', description: '', source_collection_id: '', destination_id: '' })
      queryClient.invalidateQueries(['data-connectors'])
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create connector')
    }
  })

  // Execute connector mutation
  const executeMutation = useMutation(dataConnectorsApi.execute, {
    onSuccess: (data: any) => {
      if (data.status === 'completed') {
        toast.success(`Connector completed successfully! Transferred ${data.message}`)
      } else if (data.status === 'failed') {
        toast.error(`Connector failed: ${data.message}`)
      } else {
        toast.success('Connector execution started')
      }
      queryClient.invalidateQueries(['data-connectors'])
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to execute connector')
    }
  })

  // Delete connector mutation
  const deleteMutation = useMutation(
    ({ id, force }: { id: string; force: boolean }) => dataConnectorsApi.delete(id, force),
    {
      onSuccess: () => {
        toast.success('Connector deleted successfully')
        setDeleteModal({ isOpen: false, connector: null })
        queryClient.invalidateQueries(['data-connectors'])
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.detail || 'Failed to delete connector')
      }
    }
  )

  // Download CSV mutation
  const downloadMutation = useMutation(
    (filename: string) => exportsApi.downloadCSV(filename),
    {
      onSuccess: (data) => {
        toast.success(`Downloaded ${data.filename}`)
      },
      onError: (error: any) => {
        toast.error('Failed to download CSV file')
      }
    }
  )

  // Auto-refresh running connectors every 3 seconds
  useEffect(() => {
    const runningConnectors = connectors.filter((c: DataConnector) => c.status === 'running')
    if (runningConnectors.length > 0) {
      const interval = setInterval(() => {
        console.log(`🔄 Polling ${runningConnectors.length} running connectors`)
        queryClient.invalidateQueries(['data-connectors'])
      }, 3000)
      
      return () => clearInterval(interval)
    }
  }, [connectors, queryClient])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'running':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
      case 'failed':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      case 'paused':
        return <PauseIcon className="h-5 w-5 text-yellow-500" />
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'paused':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.source_collection_id || !formData.destination_id) {
      toast.error('Please fill in all required fields')
      return
    }
    createMutation.mutate(formData)
  }

  const filteredConnectors = connectors.filter((connector: DataConnector) => 
    selectedFilter === 'all' || connector.status === selectedFilter
  )

  if (loadingConnectors) {
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
          <h1 className="text-2xl font-bold text-gray-900">FSSC Data Connectors</h1>
          <p className="text-gray-600">Manage your data synchronization pipelines</p>
        </div>
        <button
          onClick={() => setShowNewConnector(true)}
          className="btn-primary flex items-center"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          New Connector
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-4">
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {['all', 'idle', 'running', 'completed', 'failed'].map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedFilter === filter
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CogIcon className="h-8 w-8 text-gray-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Connectors</dt>
                <dd className="text-lg font-medium text-gray-900">{connectors.length}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <PlayIcon className="h-8 w-8 text-blue-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Running</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {connectors.filter((c: { status: string }) => c.status === 'running').length}
                </dd>
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
                  {connectors.filter(c => c.is_active).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-purple-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {connectors.length > 0
                    ? Math.round(connectors.filter(c => c.success_rate).reduce((acc, c) => acc + (c.success_rate || 0), 0) / connectors.length)
                    : 0}%
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Connectors Grid */}
      {filteredConnectors.length === 0 ? (
        <div className="bg-white shadow rounded-lg">
          <div className="text-center py-12">
            <CogIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No connectors found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first data connector.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowNewConnector(true)}
                className="btn-primary flex items-center"
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                New Connector
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredConnectors.map((connector: DataConnector) => (
            <div key={connector.id} className="card hover:shadow-md transition-shadow">
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <ArrowRightIcon className="h-6 w-6 text-gray-400" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-medium text-gray-900">
                          {connector.name}
                        </h3>
                        {connector.destination_type?.toUpperCase() === 'CSV' && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            CSV
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {connector.source_collection_name} → {connector.destination_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(connector.status)}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(connector.status)}`}>
                      {connector.status.charAt(0).toUpperCase() + connector.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-500">Last Run:</span>
                    <span className="text-gray-600">
                      {connector.last_execution_at ? new Date(connector.last_execution_at).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                  
                  {connector.records_transferred && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500">Records:</span>
                      <span className="text-gray-600 font-medium">
                        {connector.records_transferred.toLocaleString()} transferred
                      </span>
                    </div>
                  )}
                  
                  {connector.success_rate && connector.success_rate > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-500">Success Rate:</span>
                      <span className={`font-medium ${connector.success_rate >= 95 ? 'text-green-600' : connector.success_rate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {connector.success_rate}%
                      </span>
                    </div>
                  )}
                  
                  {connector.status === 'running' && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-md">
                      <div className="flex items-center text-blue-700">
                        <div className="animate-pulse h-2 w-2 bg-blue-400 rounded-full mr-2"></div>
                        <span className="text-xs font-medium">Data transfer in progress...</span>
                      </div>
                    </div>
                  )}
                  
                  {connector.status === 'completed' && connector.records_transferred && (
                    <div className="mt-2 p-2 bg-green-50 rounded-md">
                      <div className="flex flex-col text-green-700">
                        <div className="flex items-center">
                          <CheckCircleIcon className="h-4 w-4 mr-2" />
                          <span className="text-xs font-medium">
                            Successfully transferred {connector.records_transferred.toLocaleString()} records
                          </span>
                        </div>
                        {connector.csv_filename && (
                          <div className="flex items-center ml-6 mt-1">
                            <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
                            <span className="text-xs text-green-600">
                              CSV file ready: {connector.csv_filename}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {connector.status === 'failed' && (
                    <div className="mt-2 p-2 bg-red-50 rounded-md">
                      <div className="flex flex-col text-red-700">
                        <div className="flex items-center mb-1">
                          <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                          <span className="text-xs font-medium">Transfer failed</span>
                        </div>
                        {connector.error_message && (
                          <p className="text-xs text-red-600 ml-6 break-words">
                            {connector.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    {/* First row */}
                    <button
                      onClick={() => executeMutation.mutate(connector.id)}
                      disabled={connector.status === 'running' || executeMutation.isLoading}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      {executeMutation.isLoading ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1"></div>
                      ) : (
                        <PlayIcon className="h-3 w-3 mr-1" />
                      )}
                      Execute
                    </button>

                    {/* Show Download button for CSV with completed status */}
                    {connector.destination_type?.toUpperCase() === 'CSV' && 
                     connector.status === 'completed' && 
                     connector.csv_filename ? (
                      <button
                        onClick={() => downloadMutation.mutate(connector.csv_filename!)}
                        disabled={downloadMutation.isLoading}
                        className="btn-outline text-xs flex items-center justify-center text-green-600 border-green-300 hover:bg-green-50"
                      >
                        {downloadMutation.isLoading ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600 mr-1"></div>
                        ) : (
                          <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
                        )}
                        Download
                      </button>
                    ) : (
                      <Link 
                        href={`/dashboard/connectors/${connector.id}`}
                        className="btn-outline text-xs flex items-center justify-center text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        <ChartBarIcon className="h-3 w-3 mr-1" />
                        Details
                      </Link>
                    )}
                    
                    {/* Second row */}
                    <Link 
                      href={`/dashboard/connectors/${connector.id}/edit`}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      <PencilIcon className="h-3 w-3 mr-1" />
                      Edit
                    </Link>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, connector })}
                      disabled={deleteMutation.isLoading}
                      className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center"
                    >
                      {deleteMutation.isLoading ? (
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                      ) : (
                        <TrashIcon className="h-3 w-3 mr-1" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Connector Modal */}
      {showNewConnector && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Connector
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Connector Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    placeholder="LinkedIn to PostgreSQL"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    rows={2}
                    placeholder="Export LinkedIn campaign data to PostgreSQL database"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Collection *
                  </label>
                  <select
                    value={formData.source_collection_id}
                    onChange={(e) => setFormData(prev => ({...prev, source_collection_id: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  >
                    <option value="">Choose a data collection...</option>
                    {collections.map((collection: any) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.collection_name} ({collection.records_collected.toLocaleString()} records)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Destination *
                  </label>
                  <select
                    value={formData.destination_id}
                    onChange={(e) => setFormData(prev => ({...prev, destination_id: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  >
                    <option value="">Choose a storage destination...</option>
                    {destinations.map((dest: any) => (
                      <option key={dest.id} value={dest.id}>
                        {dest.name} ({dest.storage_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={createMutation.isLoading}
                    className="btn-primary flex items-center"
                  >
                    {createMutation.isLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    ) : (
                      <PlusIcon className="h-4 w-4 mr-2" />
                    )}
                    Create Connector
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewConnector(false)}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && deleteModal.connector && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Delete Connector
                  </h3>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Are you sure you want to delete connector <strong>"{deleteModal.connector.name}"</strong>?
                </p>
                
                {deleteModal.connector.status === 'running' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
                    <div className="flex">
                      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-yellow-800 font-medium mb-1">
                          Warning: Connector is currently running
                        </p>
                        <p className="text-xs text-yellow-700">
                          Deleting this connector will stop the current execution and permanently remove all configuration.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div><strong>Source:</strong> {deleteModal.connector.source_collection_name}</div>
                    <div><strong>Destination:</strong> {deleteModal.connector.destination_name}</div>
                    <div><strong>Status:</strong> 
                      <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deleteModal.connector.status)}`}>
                        {deleteModal.connector.status.charAt(0).toUpperCase() + deleteModal.connector.status.slice(1)}
                      </span>
                    </div>
                    {deleteModal.connector.records_transferred && (
                      <div><strong>Records Transferred:</strong> {deleteModal.connector.records_transferred.toLocaleString()}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    const force = deleteModal.connector!.status === 'running'
                    deleteMutation.mutate({ id: deleteModal.connector!.id, force })
                  }}
                  disabled={deleteMutation.isLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                >
                  {deleteMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <TrashIcon className="h-4 w-4 mr-2" />
                  )}
                  {deleteModal.connector.status === 'running' ? 'Force Delete' : 'Delete Connector'}
                </button>
                <button
                  onClick={() => setDeleteModal({ isOpen: false, connector: null })}
                  disabled={deleteMutation.isLoading}
                  className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
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
