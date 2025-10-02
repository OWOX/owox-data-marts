'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { dataMartsApi, dataStoragesApi } from '@/lib/api'
import { DataMartUpdate, DataMartDefinitionType, DataMartStatus } from '@/types/data-mart'
import { 
  ArrowLeftIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function EditDataMartPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const dataMartId = params.id

  const [formData, setFormData] = useState<DataMartUpdate>({
    title: '',
    description: '',
    storage_id: '',
    definition_type: DataMartDefinitionType.TABLE,
    status: DataMartStatus.DRAFT
  })

  const { data: dataMart, isLoading: loadingDataMart } = useQuery(
    ['data-mart', dataMartId],
    () => dataMartsApi.get(dataMartId)
  )

  const { data: storages = [], isLoading: loadingStorages } = useQuery(
    'data-storages',
    () => dataStoragesApi.getAll()
  )

  useEffect(() => {
    if (dataMart) {
      setFormData({
        title: dataMart.title,
        description: dataMart.description || '',
        storage_id: dataMart.storage_id,
        definition_type: dataMart.definition_type,
        status: dataMart.status
      })
    }
  }, [dataMart])

  const updateMutation = useMutation(
    (data: DataMartUpdate) => dataMartsApi.update(dataMartId, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['data-mart', dataMartId])
        queryClient.invalidateQueries(['data-marts'])
        toast.success('Data Mart updated successfully')
        router.push(`/dashboard/data-marts/${dataMartId}`)
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.detail || 'Failed to update data mart')
      }
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.storage_id) {
      toast.error('Please fill in all required fields')
      return
    }
    updateMutation.mutate(formData)
  }

  if (loadingDataMart || loadingStorages) {
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
      <div className="flex items-center space-x-4">
        <Link 
          href={`/dashboard/data-marts/${dataMartId}`}
          className="text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Data Mart</h1>
          <p className="text-gray-600">Update data mart configuration</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white shadow rounded-lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Title */}
            <div className="md:col-span-2">
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

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                rows={3}
                placeholder="Curated dataset for LinkedIn advertising analytics"
              />
            </div>

            {/* Storage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Storage *
              </label>
              <select
                value={formData.storage_id}
                onChange={(e) => setFormData(prev => ({...prev, storage_id: e.target.value}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                required
              >
                <option value="">Choose a data storage...</option>
                {storages.map((storage: any) => (
                  <option key={storage.id} value={storage.id}>
                    {storage.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Definition Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Definition Type *
              </label>
              <select
                value={formData.definition_type}
                onChange={(e) => setFormData(prev => ({...prev, definition_type: e.target.value as DataMartDefinitionType}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value={DataMartDefinitionType.TABLE}>Table</option>
                <option value={DataMartDefinitionType.SQL}>SQL Query</option>
                <option value={DataMartDefinitionType.CONNECTOR}>Connector</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData(prev => ({...prev, status: e.target.value as DataMartStatus}))}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value={DataMartStatus.DRAFT}>Draft</option>
                <option value={DataMartStatus.PUBLISHED}>Published</option>
                <option value={DataMartStatus.ARCHIVED}>Archived</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
            <Link
              href={`/dashboard/data-marts/${dataMartId}`}
              className="btn-outline"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={updateMutation.isLoading}
              className="btn-primary flex items-center"
            >
              {updateMutation.isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <CheckCircleIcon className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
