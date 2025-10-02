'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { reportsApi } from '@/lib/api/reports'
import { dataMartsApi } from '@/lib/api'
import { Report, ReportStatus, ReportType, ReportCreate } from '@/types/report'
import {
  PlusIcon,
  ChartBarIcon,
  TableCellsIcon,
  DocumentTextIcon,
  ArchiveBoxIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  ShareIcon,
  RocketLaunchIcon,
  ExclamationTriangleIcon,
  Square3Stack3DIcon,
  ArrowTrendingUpIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const getStatusIcon = (status: ReportStatus) => {
  switch (status) {
    case ReportStatus.PUBLISHED:
      return <ChartBarIcon className="h-5 w-5 text-green-500" />
    case ReportStatus.DRAFT:
      return <DocumentTextIcon className="h-5 w-5 text-yellow-500" />
    case ReportStatus.ARCHIVED:
      return <ArchiveBoxIcon className="h-5 w-5 text-gray-500" />
    default:
      return <ChartBarIcon className="h-5 w-5 text-gray-400" />
  }
}

const getStatusColor = (status: ReportStatus) => {
  switch (status) {
    case ReportStatus.PUBLISHED:
      return 'text-green-600 bg-green-50 border-green-200'
    case ReportStatus.DRAFT:
      return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    case ReportStatus.ARCHIVED:
      return 'text-gray-600 bg-gray-50 border-gray-200'
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200'
  }
}

const getTypeIcon = (type: ReportType) => {
  switch (type) {
    case ReportType.DASHBOARD:
      return <Square3Stack3DIcon className="h-5 w-5" />
    case ReportType.TABLE:
      return <TableCellsIcon className="h-5 w-5" />
    case ReportType.CHART:
      return <ArrowTrendingUpIcon className="h-5 w-5" />
    case ReportType.EXPORT:
      return <DocumentArrowDownIcon className="h-5 w-5" />
    default:
      return <ChartBarIcon className="h-5 w-5" />
  }
}

interface DeleteModalState {
  isOpen: boolean
  report: Report | null
}

export default function ReportsPage() {
  const [filterStatus, setFilterStatus] = useState<ReportStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<ReportType | 'all'>('all')
  const [showNewReport, setShowNewReport] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    report: null
  })
  const [formData, setFormData] = useState<ReportCreate>({
    title: '',
    description: '',
    data_mart_id: '',
    report_type: ReportType.DASHBOARD,
    is_public: false
  })

  const queryClient = useQueryClient()

  const { data: reports = [], isLoading } = useQuery(
    ['reports'],
    () => reportsApi.getAll()
  )

  const { data: dataMarts = [] } = useQuery(
    ['data-marts-for-reports'],
    () => dataMartsApi.getAll()
  )

  const createMutation = useMutation(reportsApi.create, {
    onSuccess: () => {
      queryClient.invalidateQueries(['reports'])
      toast.success('Report created successfully')
      setShowNewReport(false)
      setFormData({
        title: '',
        description: '',
        data_mart_id: '',
        report_type: ReportType.DASHBOARD,
        is_public: false
      })
    },
    onError: (error: any) => {
      console.error('Failed to create report:', error)
      const errorMessage = error.response?.data?.detail 
        || (Array.isArray(error.response?.data) 
          ? error.response.data.map((e: any) => e.msg).join(', ')
          : 'Failed to create report')
      toast.error(errorMessage)
    }
  })

  const deleteMutation = useMutation(
    (id: string) => reportsApi.delete(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['reports'])
        toast.success('Report deleted successfully')
        setDeleteModal({ isOpen: false, report: null })
      },
      onError: (error: any) => {
        console.error('Failed to delete report:', error)
        const errorMessage = error.response?.data?.detail 
          || (typeof error.response?.data === 'string' ? error.response.data : 'Failed to delete report')
        toast.error(errorMessage)
      }
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title || !formData.data_mart_id) {
      toast.error('Please fill in all required fields')
      return
    }
    createMutation.mutate(formData)
  }

  const filteredReports = reports.filter((report: Report) => {
    const statusMatch = filterStatus === 'all' || report.status === filterStatus
    const typeMatch = filterType === 'all' || report.report_type === filterType
    return statusMatch && typeMatch
  })

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
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">Create and manage your analytical reports</p>
        </div>
        <button
          onClick={() => setShowNewReport(true)}
          className="btn-primary flex items-center"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          New Report
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <div className="flex space-x-2">
            {['all', ReportStatus.DRAFT, ReportStatus.PUBLISHED, ReportStatus.ARCHIVED].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as ReportStatus | 'all')}
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

        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Type:</label>
          <div className="flex space-x-2">
            {['all', ReportType.DASHBOARD, ReportType.TABLE, ReportType.CHART, ReportType.EXPORT].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type as ReportType | 'all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterType === type
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-gray-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Total Reports</dt>
                <dd className="text-lg font-medium text-gray-900">{reports.length}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ChartBarIcon className="h-8 w-8 text-green-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Published</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {reports.filter((r: Report) => r.status === ReportStatus.PUBLISHED).length}
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
                  {reports.filter((r: Report) => r.status === ReportStatus.DRAFT).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <ShareIcon className="h-8 w-8 text-blue-400" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Public</dt>
                <dd className="text-lg font-medium text-gray-900">
                  {reports.filter((r: Report) => r.is_public).length}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              {filterStatus === 'all' && filterType === 'all' ? 'No reports' : 'No matching reports'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first report.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowNewReport(true)}
                className="btn-primary flex items-center"
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                New Report
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report: Report) => (
            <div key={report.id} className="card hover:shadow-md transition-shadow">
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-primary-600">
                      {getTypeIcon(report.report_type)}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {report.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {report.report_type.charAt(0).toUpperCase()}{report.report_type.slice(1)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(report.status)}
                    {report.is_public && (
                      <ShareIcon className="h-4 w-4 text-blue-500" title="Public" />
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(report.status)}`}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-500">Views:</span>
                    <span className="text-gray-600">{report.view_count}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-500">Created:</span>
                    <span className="text-gray-600">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {report.description && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-md">
                      <p className="text-xs text-gray-600">{report.description}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/dashboard/reports/${report.id}`}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      <EyeIcon className="h-3 w-3 mr-1" />
                      View
                    </Link>
                    <Link
                      href={`/dashboard/reports/${report.id}/edit`}
                      className="btn-outline text-xs flex items-center justify-center"
                    >
                      <PencilIcon className="h-3 w-3 mr-1" />
                      Edit
                    </Link>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + `/reports/${report.id}`)
                        toast.success('Link copied to clipboard')
                      }}
                      className="btn-outline text-xs text-blue-600 border-blue-300 hover:bg-blue-50 flex items-center justify-center"
                    >
                      <ShareIcon className="h-3 w-3 mr-1" />
                      Share
                    </button>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, report })}
                      className="btn-outline text-xs text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center"
                    >
                      <TrashIcon className="h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Report Modal */}
      {showNewReport && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Create New Report
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    placeholder="Monthly Performance Report"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    rows={2}
                    placeholder="Detailed analytics for monthly campaigns"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Mart *
                  </label>
                  <select
                    value={formData.data_mart_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_mart_id: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  >
                    <option value="">Choose a data mart...</option>
                    {dataMarts.map((mart: any) => (
                      <option key={mart.id} value={mart.id}>
                        {mart.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Report Type *
                  </label>
                  <select
                    value={formData.report_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, report_type: e.target.value as ReportType }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    required
                  >
                    <option value={ReportType.DASHBOARD}>Dashboard</option>
                    <option value={ReportType.TABLE}>Table</option>
                    <option value={ReportType.CHART}>Chart</option>
                    <option value={ReportType.EXPORT}>Export</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_public"
                    checked={formData.is_public}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_public: e.target.checked }))}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_public" className="ml-2 block text-sm text-gray-700">
                    Make this report public
                  </label>
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
                    Create Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewReport(false)}
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
      {deleteModal.isOpen && deleteModal.report && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Delete Report
                  </h3>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-3">
                  Are you sure you want to delete report <strong>"{deleteModal.report.title}"</strong>?
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div><strong>Type:</strong> {deleteModal.report.report_type}</div>
                    <div><strong>Status:</strong>
                      <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(deleteModal.report.status)}`}>
                        {deleteModal.report.status.charAt(0).toUpperCase() + deleteModal.report.status.slice(1)}
                      </span>
                    </div>
                    <div><strong>Views:</strong> {deleteModal.report.view_count}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => deleteMutation.mutate(deleteModal.report!.id)}
                  disabled={deleteMutation.isLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center"
                >
                  {deleteMutation.isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <TrashIcon className="h-4 w-4 mr-2" />
                  )}
                  Delete Report
                </button>
                <button
                  onClick={() => setDeleteModal({ isOpen: false, report: null })}
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
