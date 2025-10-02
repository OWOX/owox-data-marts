'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { storageApi } from '@/lib/api/storage'
import { StorageType } from '@/types/storage'
import { 
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PlayIcon,
  ChartBarIcon,
  ClockIcon,
  DocumentChartBarIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
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

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-600 bg-green-100'
    case 'running':
      return 'text-blue-600 bg-blue-100'
    case 'failed':
      return 'text-red-600 bg-red-100'
    case 'pending':
      return 'text-yellow-600 bg-yellow-100'
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

export default function StorageDestinationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const destinationId = params.id  // Keep as string since it's a UUID
  const [isTestingConnection, setIsTestingConnection] = useState(false)

  const { data: destination, isLoading } = useQuery(
    ['storage-destination', destinationId],
    () => storageApi.getDestination(destinationId)
  )

  const { data: metrics } = useQuery(
    ['storage-metrics', destinationId],
    () => storageApi.getDestinationMetrics(destinationId),
    { enabled: !!destination }
  )

  const { data: executions = [] } = useQuery(
    ['storage-executions', destinationId],
    () => storageApi.getDestinationExecutions(destinationId),
    { enabled: !!destination }
  )

  const validateMutation = useMutation(storageApi.validateDestination, {
    onSuccess: (result) => {
      queryClient.invalidateQueries(['storage-destination', destinationId])
      if (result.is_valid) {
        toast.success('Connection validation successful')
      } else {
        toast.error('Connection validation failed')
      }
    },
    onError: () => {
      toast.error('Failed to validate connection')
    }
  })

  const testConnectionMutation = useMutation(storageApi.testConnection, {
    onSuccess: (result) => {
      setIsTestingConnection(false)
      if (result.is_valid) {
        toast.success('Connection test successful')
      } else {
        toast.error(`Connection test failed: ${result.message}`)
      }
    },
    onError: () => {
      setIsTestingConnection(false)
      toast.error('Connection test failed')
    }
  })

  const handleTestConnection = async () => {
    setIsTestingConnection(true)
    testConnectionMutation.mutate(destinationId)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!destination) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Storage destination not found</h3>
        <p className="text-gray-500 mt-2">The requested storage destination could not be found.</p>
        <Link href="/dashboard/storage" className="btn-primary mt-4">
          Back to Storage Destinations
        </Link>
      </div>
    )
  }

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
            <div className="text-3xl">{getStorageTypeIcon(destination.storage_type)}</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {destination.name}
              </h1>
              <p className="text-gray-600">{getStorageTypeName(destination.storage_type)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection || testConnectionMutation.isLoading}
            className="btn-outline"
          >
            {isTestingConnection || testConnectionMutation.isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
            ) : (
              <PlayIcon className="mr-2 h-4 w-4" />
            )}
            Test Connection
          </button>
          <Link
            href={`/dashboard/storage/${destination.id}/edit`}
            className="btn-primary"
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* Status and Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {destination.is_active ? (
                  <CheckCircleIcon className="h-8 w-8 text-green-500" />
                ) : (
                  <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
                )}
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Status</dt>
                  <dd className={`text-lg font-medium ${
                    destination.is_active ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {destination.is_active ? 'Active' : 'Inactive'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Executions</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics?.total_executions || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentChartBarIcon className="h-8 w-8 text-purple-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Records Processed</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics?.execution_summary?.total_records_processed?.toLocaleString() || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-8 w-8 text-orange-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg. Time</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics?.execution_summary?.average_execution_time 
                      ? `${Math.round(metrics.execution_summary.average_execution_time)}s`
                      : 'N/A'
                    }
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Details */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Configuration Details</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Storage Type</span>
                  <span className="text-sm text-gray-900">{getStorageTypeName(destination.storage_type)}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Unique Key Columns</span>
                  <span className="text-sm text-gray-900">{destination.unique_key_columns.join(', ')}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Created</span>
                  <span className="text-sm text-gray-900">
                    {new Date(destination.created_at).toLocaleString()}
                  </span>
                </div>
                
                {destination.updated_at && (
                  <div className="flex items-center justify-between py-3 border-b border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Last Updated</span>
                    <span className="text-sm text-gray-900">
                      {new Date(destination.updated_at).toLocaleString()}
                    </span>
                  </div>
                )}
                
                {destination.description && (
                  <div className="py-3">
                    <span className="text-sm font-medium text-gray-700">Description</span>
                    <p className="text-sm text-gray-900 mt-1">{destination.description}</p>
                  </div>
                )}

                {/* Schema Information */}
                {destination.schema_definition && destination.schema_definition.length > 0 && (
                  <div className="py-3">
                    <span className="text-sm font-medium text-gray-700 block mb-2">Schema Definition</span>
                    <div className="bg-gray-50 rounded-md p-3">
                      <div className="space-y-2">
                        {destination.schema_definition.map((field, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span className="font-mono">{field.name}</span>
                            <span className="text-gray-600">{field.field_type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Validation Status */}
        <div className="space-y-6">
          {metrics?.validation_status && (
            <div className="card">
              <div className="card-body">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Last Validation</h3>
                
                <div className="space-y-3">
                  <div className={`flex items-center space-x-2 ${
                    metrics.validation_status.is_valid ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {metrics.validation_status.is_valid ? (
                      <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                      <ExclamationCircleIcon className="h-5 w-5" />
                    )}
                    <span className="font-medium">
                      {metrics.validation_status.is_valid ? 'Valid' : 'Invalid'}
                    </span>
                  </div>
                  
                  {metrics.validation_status.validation_message && (
                    <p className="text-sm text-gray-600">
                      {metrics.validation_status.validation_message}
                    </p>
                  )}
                  
                  <div className="text-xs text-gray-500">
                    {metrics.validation_status.validated_at && (
                      <>Validated {new Date(metrics.validation_status.validated_at).toLocaleString()}</>
                    )}
                    {metrics.validation_status.response_time_ms && (
                      <span> • {metrics.validation_status.response_time_ms}ms</span>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => validateMutation.mutate(destinationId)}
                  disabled={validateMutation.isLoading}
                  className="btn-outline w-full mt-4"
                >
                  {validateMutation.isLoading ? 'Validating...' : 'Validate Now'}
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="card">
            <div className="card-body">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                <Link 
                  href={`/dashboard/storage/${destination.id}/execute`}
                  className="btn-primary w-full"
                >
                  <PlayIcon className="mr-2 h-4 w-4" />
                  Execute Storage Operation
                </Link>
                
                <Link 
                  href={`/dashboard/storage/${destination.id}/metrics`}
                  className="btn-outline w-full"
                >
                  <ChartBarIcon className="mr-2 h-4 w-4" />
                  View Detailed Metrics
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Executions */}
      <div className="card">
        <div className="card-body">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Executions</h3>
          
          {executions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Records
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Started
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {executions.slice(0, 10).map((execution) => (
                    <tr key={execution.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          getStatusColor(execution.execution_status)
                        }`}>
                          {execution.execution_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>
                          <div>Processed: {execution.records_processed}</div>
                          {execution.records_failed > 0 && (
                            <div className="text-red-600">Failed: {execution.records_failed}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {execution.execution_time_seconds 
                          ? `${Math.round(execution.execution_time_seconds)}s`
                          : 'N/A'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {execution.source_platform || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {execution.started_at 
                          ? new Date(execution.started_at).toLocaleString()
                          : new Date(execution.created_at).toLocaleString()
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <InformationCircleIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No executions yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Execute your first storage operation to see results here.
              </p>
              <div className="mt-6">
                <Link
                  href={`/dashboard/storage/${destination.id}/execute`}
                  className="btn-primary"
                >
                  <PlayIcon className="mr-2 h-4 w-4" />
                  Execute Storage Operation
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
