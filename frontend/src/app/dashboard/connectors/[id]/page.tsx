'use client'

import { useState, useEffect } from 'react'
import { 
  ArrowLeftIcon as ArrowLeft, 
  PlayIcon as Play, 
  PauseIcon as Pause, 
  CogIcon as Settings, 
  ChartBarIcon as BarChart3, 
  ClockIcon as Clock, 
  ExclamationTriangleIcon as AlertCircle, 
  CheckCircleIcon as CheckCircle, 
  BoltIcon as Activity,
  CalendarIcon as Calendar,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { dataConnectorsApi, exportsApi } from '@/lib/api'
import toast from 'react-hot-toast'

interface DataConnector {
  id: string
  name: string
  description?: string
  connector_type: string
  destination_type?: string
  source_collection_id: string
  source_collection_name: string
  destination_id: string
  destination_name: string
  status: string
  is_active: boolean
  last_execution_at?: string
  records_transferred?: number
  success_rate?: number
  csv_filename?: string
  error_message?: string
  created_at: string
}

interface Execution {
  execution_id: string
  status: string
  started_at?: string
  completed_at?: string
  extracted_records: number
  transformed_records: number
  loaded_records: number
  failed_records: number
  error_message?: string
}

interface ScheduledJob {
  id: string
  connector_id: string
  name: string
  description?: string
  scheduled_at: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  created_at: string
  executed_at?: string
  error_message?: string
}

export default function ConnectorDetailPage({ params }: { params: { id: string } }) {
  const [connector, setConnector] = useState<DataConnector | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [schedulingData, setSchedulingData] = useState({
    name: '',
    description: '',
    scheduled_at: '',
    repeat_type: 'once' // once, daily, weekly, monthly
  })

  useEffect(() => {
    fetchConnectorDetails()
    fetchExecutions()
    fetchScheduledJobs()
  }, [params.id])

  const fetchConnectorDetails = async () => {
    try {
      const data = await dataConnectorsApi.get(params.id)
      setConnector(data)
    } catch (error) {
      console.error('Error fetching connector:', error)
    }
  }

  const fetchExecutions = async () => {
    try {
      // For now, simulate execution history
      const simulatedExecutions: Execution[] = [
        {
          execution_id: 'exec_001',
          status: 'completed',
          started_at: new Date(Date.now() - 3600000).toISOString(),
          completed_at: new Date(Date.now() - 3500000).toISOString(),
          extracted_records: 6562,
          transformed_records: 6562,
          loaded_records: 6562,
          failed_records: 0
        },
        {
          execution_id: 'exec_002',
          status: 'completed',
          started_at: new Date(Date.now() - 7200000).toISOString(),
          completed_at: new Date(Date.now() - 7100000).toISOString(),
          extracted_records: 5234,
          transformed_records: 5234,
          loaded_records: 5234,
          failed_records: 0
        }
      ]
      setExecutions(simulatedExecutions)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching executions:', error)
      setExecutions([])
      setLoading(false)
    }
  }

  const fetchScheduledJobs = async () => {
    try {
      const jobs = await dataConnectorsApi.getScheduledJobs(params.id)
      setScheduledJobs(jobs)
    } catch (error) {
      console.error('Error fetching scheduled jobs:', error)
      setScheduledJobs([])
    }
  }

  const executeConnector = async () => {
    setExecuting(true)
    try {
      await dataConnectorsApi.execute(params.id)
      toast.success('Connector execution started')
      setTimeout(() => {
        fetchConnectorDetails()
        fetchExecutions()
      }, 1000)
    } catch (error) {
      console.error('Error executing connector:', error)
      toast.error('Failed to execute connector')
    } finally {
      setExecuting(false)
    }
  }

  const downloadCSV = async () => {
    if (!connector?.csv_filename) return
    
    setDownloading(true)
    try {
      await exportsApi.downloadCSV(connector.csv_filename)
      toast.success('CSV file downloaded successfully')
    } catch (error) {
      console.error('Error downloading CSV:', error)
      toast.error('Failed to download CSV file')
    } finally {
      setDownloading(false)
    }
  }

  const handleScheduleJob = async () => {
    try {
      // Create scheduled job via API
      const jobData = {
        name: schedulingData.name,
        description: schedulingData.description,
        scheduled_at: schedulingData.scheduled_at,
        repeat_type: schedulingData.repeat_type
      }
      
      const newJob = await dataConnectorsApi.createScheduledJob(params.id, jobData)
      
      // Refresh scheduled jobs list
      await fetchScheduledJobs()
      
      // Reset form and close modal
      setSchedulingData({
        name: '',
        description: '',
        scheduled_at: '',
        repeat_type: 'once'
      })
      setShowScheduleModal(false)
      
      alert(`Job "${newJob.name}" scheduled for ${new Date(newJob.scheduled_at).toLocaleString()}`)
      
    } catch (error) {
      console.error('Error scheduling job:', error)
      alert('Failed to schedule job. Please try again.')
    }
  }

  const handleDeleteScheduledJob = async (jobId: string, jobName: string) => {
    if (confirm(`Are you sure you want to delete scheduled job "${jobName}"?`)) {
      try {
        await dataConnectorsApi.deleteScheduledJob(params.id, jobId)
        await fetchScheduledJobs()
        alert(`Scheduled job "${jobName}" deleted successfully`)
      } catch (error) {
        console.error('Error deleting scheduled job:', error)
        alert('Failed to delete scheduled job. Please try again.')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading connector details...</p>
        </div>
      </div>
    )
  }

  if (!connector) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Connector not found</h3>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center">
              <Link href="/dashboard/connectors" className="mr-4 p-2 text-gray-400 hover:text-gray-600">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{connector.name}</h1>
                <p className="mt-1 text-sm text-gray-500">{connector.description}</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={executeConnector}
                disabled={executing || connector.status === 'running'}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                  executing || connector.status === 'running'
                    ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    : 'text-white bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <Play className="w-4 h-4 mr-2" />
                {executing ? 'Starting...' : 'Execute Now'}
              </button>
              
              {/* Download CSV button - only show when CSV file is available */}
              {connector.csv_filename && connector.status === 'completed' && (
                <button
                  onClick={downloadCSV}
                  disabled={downloading}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  {downloading ? 'Downloading...' : 'Download CSV'}
                </button>
              )}
              
              <button
                onClick={() => setShowScheduleModal(true)}
                className="inline-flex items-center px-4 py-2 border border-green-300 text-sm font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100"
              >
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Jobs
              </button>
              <Link
                href={`/dashboard/connectors/${connector.id}/settings`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connector Info Section */}
        <div className="bg-white shadow rounded-lg mb-8 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Connector Information</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">Source Collection</dt>
              <dd className="mt-1 text-sm text-gray-900">{connector.source_collection_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Destination</dt>
              <dd className="mt-1 text-sm text-gray-900">{connector.destination_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Connector Type</dt>
              <dd className="mt-1 text-sm text-gray-900">{connector.connector_type}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(connector.created_at).toLocaleDateString()}
              </dd>
            </div>
            {connector.records_transferred && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Records Transferred</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {connector.records_transferred.toLocaleString()}
                </dd>
              </div>
            )}
            {connector.success_rate && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Success Rate</dt>
                <dd className="mt-1 text-sm text-gray-900">{connector.success_rate}%</dd>
              </div>
            )}
            {connector.csv_filename && (
              <div className="col-span-2">
                <dt className="text-sm font-medium text-gray-500">CSV Export File</dt>
                <dd className="mt-1 text-sm text-gray-900 flex items-center">
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2 text-green-600" />
                  <span className="font-mono bg-green-50 text-green-700 px-2 py-1 rounded">
                    {connector.csv_filename}
                  </span>
                </dd>
              </div>
            )}
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <Activity className="h-6 w-6 text-blue-400" />
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <p className="text-lg font-medium text-gray-900 capitalize">{connector.status}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <BarChart3 className="h-6 w-6 text-green-400" />
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Total Executions</p>
                  <p className="text-lg font-medium text-gray-900">{executions.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <CheckCircle className="h-6 w-6 text-purple-400" />
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Success Rate</p>
                  <p className="text-lg font-medium text-gray-900">
                    {executions.length > 0 ? 
                      Math.round(executions.filter(e => e.status === 'completed').length / executions.length * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <Clock className="h-6 w-6 text-orange-400" />
                <div className="ml-5">
                  <p className="text-sm font-medium text-gray-500">Last Run</p>
                  <p className="text-lg font-medium text-gray-900">
                    {connector.last_execution_at ? 
                      new Date(connector.last_execution_at).toLocaleDateString() : 
                      'Never'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Executions */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Executions</h3>
          </div>
          
          {executions.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No executions yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                This connector hasn't been executed. Click "Execute Now" to start your first sync.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {executions.slice(0, 10).map((execution) => (
                <div key={execution.execution_id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`flex-shrink-0 w-3 h-3 rounded-full ${
                        execution.status === 'completed' ? 'bg-green-400' :
                        execution.status === 'failed' ? 'bg-red-400' :
                        execution.status === 'running' ? 'bg-blue-400' : 'bg-yellow-400'
                      }`}></div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Execution {execution.execution_id.slice(-8)}
                        </p>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{execution.extracted_records} extracted</span>
                          <span>{execution.transformed_records} transformed</span>
                          <span>{execution.loaded_records} loaded</span>
                          {execution.failed_records > 0 && (
                            <span className="text-red-600">{execution.failed_records} failed</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {execution.completed_at ? 
                          new Date(execution.completed_at).toLocaleString() :
                          execution.started_at ? 
                            `Started ${new Date(execution.started_at).toLocaleString()}` :
                            'Pending'
                        }
                      </p>
                      <p className={`text-sm font-medium capitalize ${
                        execution.status === 'completed' ? 'text-green-600' :
                        execution.status === 'failed' ? 'text-red-600' :
                        execution.status === 'running' ? 'text-blue-600' : 'text-yellow-600'
                      }`}>
                        {execution.status}
                      </p>
                    </div>
                  </div>
                  {execution.error_message && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                      {execution.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scheduled Jobs Section */}
        <div className="bg-white shadow rounded-lg mt-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Scheduled Jobs</h3>
          </div>
          
          {scheduledJobs.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No scheduled jobs</h3>
              <p className="mt-1 text-sm text-gray-500">
                Schedule automatic executions for this connector using the "Schedule Jobs" button above.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {scheduledJobs.map((job) => (
                <div key={job.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{job.name}</p>
                      <p className="text-sm text-gray-500">{job.description}</p>
                      <p className="text-xs text-gray-400">
                        Scheduled for: {new Date(job.scheduled_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          job.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                          job.status === 'completed' ? 'bg-green-100 text-green-800' :
                          job.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {job.status}
                        </span>
                        <button
                          onClick={() => handleDeleteScheduledJob(job.id, job.name)}
                          className="text-red-400 hover:text-red-600 text-xs"
                          title="Delete scheduled job"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Job Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Schedule Job</h3>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault()
                handleScheduleJob()
              }}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Name
                  </label>
                  <input
                    type="text"
                    value={schedulingData.name}
                    onChange={(e) => setSchedulingData({...schedulingData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Daily LinkedIn sync"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={schedulingData.description}
                    onChange={(e) => setSchedulingData({...schedulingData, description: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Automated daily sync of LinkedIn campaign data"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scheduled Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={schedulingData.scheduled_at}
                    onChange={(e) => setSchedulingData({...schedulingData, scheduled_at: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={new Date().toISOString().slice(0, 16)}
                    required
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Repeat
                  </label>
                  <select
                    value={schedulingData.repeat_type}
                    onChange={(e) => setSchedulingData({...schedulingData, repeat_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="once">Run Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    Schedule Job
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
