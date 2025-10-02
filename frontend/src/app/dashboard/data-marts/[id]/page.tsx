'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { dataMartsApi } from '@/lib/api'
import { DataMart, DataMartStatus, DataMartDefinitionType } from '@/types/data-mart'
import { 
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  TrashIcon,
  RocketLaunchIcon,
  DocumentTextIcon,
  ArchiveBoxIcon,
  TableCellsIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const getStatusIcon = (status: DataMartStatus) => {
  switch (status) {
    case DataMartStatus.PUBLISHED:
      return <CheckCircleIcon className="h-8 w-8 text-green-500" />
    case DataMartStatus.DRAFT:
      return <DocumentTextIcon className="h-8 w-8 text-yellow-500" />
    case DataMartStatus.ARCHIVED:
      return <ArchiveBoxIcon className="h-8 w-8 text-gray-500" />
    default:
      return <TableCellsIcon className="h-8 w-8 text-gray-400" />
  }
}

const getStatusColor = (status: DataMartStatus) => {
  switch (status) {
    case DataMartStatus.PUBLISHED:
      return 'text-green-600 bg-green-100'
    case DataMartStatus.DRAFT:
      return 'text-yellow-600 bg-yellow-100'
    case DataMartStatus.ARCHIVED:
      return 'text-gray-600 bg-gray-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

export default function DataMartDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dataMartId = params.id
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: dataMart, isLoading } = useQuery(
    ['data-mart', dataMartId],
    () => dataMartsApi.get(dataMartId)
  )

  const deleteMutation = useMutation(() => dataMartsApi.delete(dataMartId), {
    onSuccess: () => {
      toast.success('Data Mart deleted successfully')
      router.push('/dashboard/data-marts')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete data mart')
    }
  })

  const publishMutation = useMutation(() => dataMartsApi.publish(dataMartId), {
    onSuccess: () => {
      queryClient.invalidateQueries(['data-mart', dataMartId])
      toast.success('Data Mart published successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to publish data mart')
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!dataMart) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Data Mart not found</h3>
        <Link href="/dashboard/data-marts" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          ← Back to Data Marts
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link 
            href="/dashboard/data-marts"
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{dataMart.title}</h1>
            <p className="text-gray-600">Data Mart Details</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {dataMart.status === DataMartStatus.DRAFT && (
            <button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isLoading}
              className="btn-primary flex items-center"
            >
              {publishMutation.isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <RocketLaunchIcon className="h-4 w-4 mr-2" />
              )}
              Publish
            </button>
          )}
          <Link 
            href={`/dashboard/data-marts/${dataMartId}/edit`}
            className="btn-outline flex items-center"
          >
            <PencilIcon className="h-4 w-4 mr-2" />
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn-outline text-red-600 border-red-300 hover:bg-red-50 flex items-center"
          >
            <TrashIcon className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {getStatusIcon(dataMart.status)}
            <div>
              <h3 className="text-lg font-medium text-gray-900">Status</h3>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(dataMart.status)}`}>
                {dataMart.status.charAt(0).toUpperCase() + dataMart.status.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Title</dt>
              <dd className="mt-1 text-sm text-gray-900">{dataMart.title}</dd>
            </div>
            {dataMart.description && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Description</dt>
                <dd className="mt-1 text-sm text-gray-900">{dataMart.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Definition Type</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {dataMart.definition_type?.charAt(0).toUpperCase()}{dataMart.definition_type?.slice(1) || 'Not specified'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Project ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{dataMart.project_id}</dd>
            </div>
          </dl>
        </div>

        {/* Metadata */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Metadata</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Data Mart ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{dataMart.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Storage ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{dataMart.storage_id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(dataMart.created_at).toLocaleString()}
              </dd>
            </div>
            {dataMart.updated_at && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(dataMart.updated_at).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Schema & Definition */}
      {(dataMart.schema || dataMart.definition) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dataMart.schema && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Schema</h3>
              <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-xs">
                {JSON.stringify(dataMart.schema, null, 2)}
              </pre>
            </div>
          )}
          
          {dataMart.definition && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Definition</h3>
              <pre className="bg-gray-50 p-4 rounded-md overflow-auto text-xs">
                {JSON.stringify(dataMart.definition, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
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
                <p className="text-sm text-gray-600">
                  Are you sure you want to delete <strong>"{dataMart.title}"</strong>? This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                >
                  {deleteMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <TrashIcon className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
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
