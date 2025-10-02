'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { dataMartsApi, dataStoragesApi } from '@/lib/api'
import { storageApi } from '@/lib/api/storage'
import { DataMart, DataMartStatus, DataMartDefinitionType, DataMartCreate } from '@/types/data-mart'
import { 
  PlusIcon,
  TableCellsIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  DocumentTextIcon,
  RocketLaunchIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const getStatusIcon = (status: DataMartStatus) => {
  switch (status) {
    case DataMartStatus.PUBLISHED:
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />
    case DataMartStatus.DRAFT:
      return <DocumentTextIcon className="h-5 w-5 text-yellow-500" />
    case DataMartStatus.ARCHIVED:
      return <ArchiveBoxIcon className="h-5 w-5 text-gray-500" />
    default:
      return <TableCellsIcon className="h-5 w-5 text-gray-400" />
  }
}

const getStatusColor = (status: DataMartStatus) => {
  switch (status) {
    case DataMartStatus.PUBLISHED:
      return 'text-green-600 bg-green-50 border-green-200'
    case DataMartStatus.DRAFT:
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case DataMartStatus.ARCHIVED:
      return 'text-gray-600 bg-gray-50 border-gray-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const getDefinitionTypeIcon = (type?: DataMartDefinitionType) => {
  switch (type) {
    case DataMartDefinitionType.CONNECTOR:
      return '🔗'
    case DataMartDefinitionType.SQL:
      return '📝'
    case DataMartDefinitionType.TABLE:
      return '📊'
    default:
      return '💾'
  }
}

interface DeleteModalState {
  isOpen: boolean
  dataMart: DataMart | null
}

export default function DataMartsPage() {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<DataMartStatus | 'all'>('all')
  const [showNewDataMart, setShowNewDataMart] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    dataMart: null
  })
  const [formData, setFormData] = useState<DataMartCreate>({
    title: '',
    description: '',
    destination_id: '',  // Use destination_id for storage destinations
    definition_type: DataMartDefinitionType.TABLE
  })
  
  const queryClient = useQueryClient()
  
  const { data: dataMarts = [], isLoading } = useQuery(
    ['data-marts', filterStatus],
    () => dataMartsApi.getAll()
  )

  // Use storage destinations (what user has already created)
  const { data: storageDestinations = [], isLoading: loadingStorages } = useQuery(
    'storage-destinations-for-marts',
    () => storageApi.getDestinations(),
    {
      onSuccess: (data) => {
        console.log('✅ Storage Destinations loaded successfully:', data)
        console.log('Number of destinations:', data?.length || 0)
      },
      onError: (error: any) => {
        console.error('❌ Failed to fetch storage destinations:', error)
        console.error('Error details:', error.response?.data || error.message)
        toast.error('Failed to load storage destinations')
      }
    }
  )
  
  // Map destinations to storage format for the form
  const storages = storageDestinations

  const createMutation = useMutation(dataMartsApi.create, {
    onSuccess: () => {
      queryClient.invalidateQueries(['data-marts'])
      toast.success('Data Mart created successfully')
      setShowNewDataMart(false)
      setFormData({
        title: '',
        description: '',
        destination_id: '',
        definition_type: DataMartDefinitionType.TABLE
      })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create data mart')
    }
  })

  const deleteMutation = useMutation(
    ({ id }: { id: string }) => dataMartsApi.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['data-marts'])
        toast.success('Data Mart deleted successfully')
        setDeleteModal({ isOpen: false, dataMart: null })
        setDeletingId(null)
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.detail || 'Failed to delete data mart')
        setDeletingId(null)
      }
    }
  )

  const publishMutation = useMutation(dataMartsApi.publish, {
    onSuccess: () => {
      queryClient.invalidateQueries(['data-marts'])
      toast.success('Data Mart published successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to publish data mart')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.destination_id) {
      toast.error('Please fill in all required fields')
      return
    }
    createMutation.mutate(formData)
  }

  const filteredDataMarts = dataMarts.filter((mart: DataMart) => 
    filterStatus === 'all' || mart.status === filterStatus
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
          <h1 className="text-2xl font-bold text-gray-900">Data Marts</h1>
          <p className="text-gray-600">Manage your curated analytical datasets</p>
        </div>
        <button
          onClick={() => setShowNewDataMart(true)}
          className="btn-primary flex items-center"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          New Data Mart
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Filter by status:</label>
        <div className="flex space-x-2">
          {['all', DataMartStatus.DRAFT, DataMartStatus.PUBLISHED, DataMartStatus.ARCHIVED].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status as DataMartStatus | 'all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filterStatus === status
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TableCellsIcon className="h-8 w-8 text-gray-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Data Marts</dt>
                <dd className="text-lg font-medium text-gray-900">{dataMarts.length}</dd>
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
                <dt className="text-sm font-medium text-gray-500 truncate">Published</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {dataMarts.filter((m: DataMart) => m.status === DataMartStatus.PUBLISHED).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-8 w-8 text-yellow-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Drafts</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {dataMarts.filter((m: DataMart) => m.status === DataMartStatus.DRAFT).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ArchiveBoxIcon className="h-8 w-8 text-gray-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Archived</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {dataMarts.filter((m: DataMart) => m.status === DataMartStatus.ARCHIVED).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Data Marts Grid */}
      {filteredDataMarts.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <TableCellsIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {filterStatus === 'all' ? 'No data marts' : `No ${filterStatus} data marts`}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first data mart.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowNewDataMart(true)}
                className="btn-primary flex items-center"
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                New Data Mart
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDataMarts.map((mart: DataMart) => (
            <div key={mart.id} className="card hover:shadow-md transition-shadow">
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{getDefinitionTypeIcon(mart.definition_type)}</div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {mart.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {mart.definition_type?.charAt(0).toUpperCase()}{mart.definition_type?.slice(1)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(mart.status)}
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(mart.status)}`}>
                      {mart.status.charAt(0).toUpperCase() + mart.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-500">Created:</span>
                    <span className="text-gray-600">
                      {new Date(mart.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {mart.description && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-md">
                      <p className="text-xs text-gray-600">{mart.description}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    {/* First row */}
                    <Link 
                      href={`/dashboard/data-marts/${mart.id}`}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      <EyeIcon className="h-3 w-3 mr-1" />
                      View
                    </Link>
                    <Link 
                      href={`/dashboard/data-marts/${mart.id}/edit`}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      <PencilIcon className="h-3 w-3 mr-1" />
                      Edit
                    </Link>
                    
                    {/* Second row */}
                    {mart.status === DataMartStatus.DRAFT && (
                      <button
                        onClick={() => publishMutation.mutate(mart.id)}
                        disabled={publishMutation.isLoading}
                        className="btn-outline text-xs text-green-600 border-green-300 hover:bg-green-50 flex items-center justify-center"
                      >
                        {publishMutation.isLoading ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600"></div>
                        ) : (
                          <>
                            <RocketLaunchIcon className="h-3 w-3 mr-1" />
                            Publish
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, dataMart: mart })}
                      disabled={deletingId === mart.id}
                      className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center"
                    >
                      {deletingId === mart.id ? (
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

      {/* New Data Mart Modal */}
      {showNewDataMart && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Data Mart
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({...prev, title: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    placeholder="LinkedIn Ads Performance Mart"
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
                    placeholder="Curated dataset for LinkedIn advertising analytics"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Storage Destination *
                  </label>
                  <select
                    value={formData.destination_id}
                    onChange={(e) => setFormData(prev => ({...prev, destination_id: e.target.value}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                    disabled={loadingStorages}
                  >
                    <option value="">
                      {loadingStorages ? 'Loading storages...' : storages.length === 0 ? 'No storages available - create one first' : 'Choose a data storage...'}
                    </option>
                    {storages.map((storage: any) => (
                      <option key={storage.id} value={storage.id}>
                        {storage.name}
                      </option>
                    ))}
                  </select>
                  {storages.length === 0 && !loadingStorages && (
                    <p className="mt-2 text-sm text-yellow-600">
                      ⚠️ No data storages found. Please{' '}
                      <Link href="/dashboard/storage/new" className="underline font-medium">
                        create a storage destination
                      </Link>
                      {' '}first.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Definition Type *
                  </label>
                  <select
                    value={formData.definition_type}
                    onChange={(e) => setFormData(prev => ({...prev, definition_type: e.target.value as DataMartDefinitionType}))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  >
                    <option value={DataMartDefinitionType.TABLE}>Table</option>
                    <option value={DataMartDefinitionType.SQL}>SQL Query</option>
                    <option value={DataMartDefinitionType.CONNECTOR}>Connector</option>
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
                    Create Data Mart
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewDataMart(false)}
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
      {deleteModal.isOpen && deleteModal.dataMart && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Delete Data Mart
                  </h3>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Are you sure you want to delete data mart <strong>"{deleteModal.dataMart.title}"</strong>?
                </p>
                
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div><strong>Type:</strong> {deleteModal.dataMart.definition_type}</div>
                    <div><strong>Status:</strong> 
                      <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deleteModal.dataMart.status)}`}>
                        {deleteModal.dataMart.status.charAt(0).toUpperCase() + deleteModal.dataMart.status.slice(1)}
                      </span>
                    </div>
                    <div><strong>Created:</strong> {new Date(deleteModal.dataMart.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setDeletingId(deleteModal.dataMart!.id)
                    deleteMutation.mutate({ id: deleteModal.dataMart!.id })
                  }}
                  disabled={deleteMutation.isLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                >
                  {deleteMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <TrashIcon className="h-4 w-4 mr-2" />
                  )}
                  Delete Data Mart
                </button>
                <button
                  onClick={() => setDeleteModal({ isOpen: false, dataMart: null })}
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
