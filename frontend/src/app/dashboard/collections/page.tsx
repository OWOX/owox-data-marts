'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  PlayIcon as Play,
  CloudArrowDownIcon as Download,
  CogIcon as Settings,
  ExclamationTriangleIcon as AlertCircle,
  CheckCircleIcon as CheckCircle,
  ClockIcon as Clock,
  PlusIcon as Plus
} from '@heroicons/react/24/outline'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { dataCollectionApi } from '@/lib/api'
import { LinkedInAccountSelector } from '@/components/collections/LinkedInAccountSelector'
import { LinkedInFieldSelector } from '@/components/collections/LinkedInFieldSelector'
import { 
  CollectionJob, 
  CollectionFormData 
} from '@/types/collections'
import { PlatformCredential } from '@/types/platform-credential'

export default function DataCollectionsPage() {
  const [activeJobs, setActiveJobs] = useState<CollectionJob[]>([])
  const [recentJobs, setRecentJobs] = useState<CollectionJob[]>([])
  const [credentials, setCredentials] = useState<PlatformCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewCollection, setShowNewCollection] = useState(false)

  // Form state for new collection
  const [formData, setFormData] = useState<CollectionFormData>({
    platform_credential_id: '',
    account_urns: [],
    start_date: '',
    end_date: '',
    fields: []
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      console.log('🔍 [COLLECTIONS] Fetching data...')
      
      console.log('🔍 [COLLECTIONS] Making API calls...')
      
      let recentJobs: CollectionJob[] = []
      let activeJobs: CollectionJob[] = []
      let credentials: PlatformCredential[] = []
      
      try {
        console.log('📥 [COLLECTIONS] Fetching recent jobs...')
        const recentResponse = await dataCollectionApi.getRecent()
        console.log('📊 [COLLECTIONS] Recent jobs response:', recentResponse)
        recentJobs = Array.isArray(recentResponse.data) ? recentResponse.data : []
      } catch (error) {
        console.error('❌ [COLLECTIONS] Recent jobs error:', error)
      }
      
      try {
        console.log('🏃 [COLLECTIONS] Fetching active jobs...')
        const activeResponse = await dataCollectionApi.getActiveJobs()
        console.log('🔄 [COLLECTIONS] Active jobs response:', activeResponse)
        activeJobs = Array.isArray(activeResponse.data) ? activeResponse.data : []
      } catch (error) {
        console.error('❌ [COLLECTIONS] Active jobs error:', error)
      }
      
      try {
        console.log('🔑 [COLLECTIONS] Fetching credentials...')
        const credentialsResponse = await platformCredentialsApi.getAll()
        console.log('📋 [COLLECTIONS] Credentials response:', credentialsResponse)
        credentials = Array.isArray(credentialsResponse) ? credentialsResponse.filter((cred: PlatformCredential) => 
          cred.platform_name === 'linkedin'
        ) : []
      } catch (error) {
        console.error('❌ [COLLECTIONS] Credentials error:', error)
      }
      
      setRecentJobs(recentJobs)
      setActiveJobs(activeJobs)
      setCredentials(credentials)
      
      console.log('✅ [COLLECTIONS] Data fetched successfully')
    } catch (error: any) {
      console.error('❌ [COLLECTIONS] Error fetching data:', error)
      setCredentials([])
      setRecentJobs([])
      setActiveJobs([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      // Validate required fields
      if (!formData.platform_credential_id || formData.account_urns.length === 0 || 
          !formData.start_date || !formData.end_date) {
        throw new Error('Please fill in all required fields')
      }

      if (formData.fields.length === 0) {
        throw new Error('Please select at least one field to collect')
      }

      // Format account URNs - ensure they're in proper format
      const accountUrns = formData.account_urns.map((urn: string) => {
        // If it's just a number, format as full URN
        if (/^\d+$/.test(urn)) {
          return `urn:li:sponsoredAccount:${urn}`
        }
        // If already a URN, use as-is
        if (urn.startsWith('urn:li:sponsoredAccount:')) {
          return urn
        }
        // Otherwise, assume it needs the URN prefix
        return `urn:li:sponsoredAccount:${urn}`
      })

      const submissionCollectionName = `LinkedIn Collection ${new Date().toLocaleString()}`
      
      const payload = {
        platform_credential_id: parseInt(formData.platform_credential_id),
        account_urns: accountUrns,
        start_date: formData.start_date,
        end_date: formData.end_date,
        fields: formData.fields,
        collection_name: submissionCollectionName
      }

      console.log('Submitting LinkedIn data collection:', payload)

      const result = await dataCollectionApi.collectLinkedInData(payload)
      console.log('✅ [COLLECTIONS] Collection result:', result)
      
      const responseData = result.data || result
      const recordsCollected = responseData.records_collected || 0
      const resultCollectionName = responseData.collection_name || payload.collection_name
      
      setSuccess(`Successfully collected ${recordsCollected} records! Collection: ${resultCollectionName}`)
      setShowNewCollection(false)
      
      // Reset form
      setFormData({
        platform_credential_id: '',
        account_urns: [],
        start_date: '',
        end_date: '',
        fields: []
      })
      
      // Refresh data to show the new collection
      console.log('🔄 [COLLECTIONS] Refreshing data after successful collection...')
      setTimeout(() => {
        fetchData()
      }, 1000) // Small delay to ensure backend has processed everything

    } catch (error: any) {
      console.error('Collection error:', error)
      setError(error.message || 'Failed to collect data')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50'
      case 'running': return 'text-blue-600 bg-blue-50'
      case 'failed': return 'text-red-600 bg-red-50'
      case 'pending': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />
      case 'running': return <Play className="w-4 h-4" />
      case 'failed': return <AlertCircle className="w-4 h-4" />
      case 'pending': return <Clock className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading data collections...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Data Collections</h1>
              <p className="mt-1 text-sm text-gray-500">
                Collect data from your connected platforms
              </p>
            </div>
            <button
              onClick={() => setShowNewCollection(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Collection
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <div className="ml-3">
                <p className="text-sm text-green-700">{success}</p>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="ml-auto text-green-400 hover:text-green-600"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Play className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Active Collections
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {activeJobs.length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Download className="h-6 w-6 text-green-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Records
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {recentJobs.reduce((sum, job) => sum + (job.records_collected || 0), 0).toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Settings className="h-6 w-6 text-purple-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Success Rate
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {recentJobs.length > 0 ? 
                        Math.round(recentJobs.filter(job => job.status === 'completed').length / recentJobs.length * 100) : 0}%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Jobs Alert */}
        {activeJobs.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <Play className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">{activeJobs.length} collection(s) currently running</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* New Collection Form */}
        {showNewCollection && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">New LinkedIn Data Collection</h3>
                <button
                  onClick={() => setShowNewCollection(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Credential Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LinkedIn Credential *
                </label>
                <select
                  value={formData.platform_credential_id}
                  onChange={(e) => setFormData(prev => ({...prev, platform_credential_id: e.target.value}))}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select a LinkedIn credential</option>
                  {credentials.map(cred => (
                    <option key={cred.id} value={cred.id}>
                      {cred.account_name || cred.platform_display_name} ({cred.is_active ? 'Active' : 'Inactive'})
                    </option>
                  ))}
                </select>
                {credentials.length === 0 && (
                  <p className="mt-1 text-sm text-red-600">
                    No LinkedIn credentials found. Please add one first.
                  </p>
                )}
              </div>

              {/* Account Selection */}
              <LinkedInAccountSelector
                credentialId={formData.platform_credential_id}
                selectedAccounts={formData.account_urns}
                onAccountsChange={(accounts) => setFormData(prev => ({...prev, account_urns: accounts}))}
              />

              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({...prev, start_date: e.target.value}))}
                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({...prev, end_date: e.target.value}))}
                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Fields Selection */}
              <LinkedInFieldSelector
                selectedFields={formData.fields}
                onFieldsChange={(fields) => setFormData(prev => ({...prev, fields}))}
              />

              {/* Submit */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowNewCollection(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Collecting...' : 'Start Collection'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Recent Collections */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Collections</h3>
          </div>
          
          {recentJobs.length === 0 ? (
            <div className="text-center py-12">
              <Download className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No collections yet</h3>
              <p className="mt-1 text-sm text-gray-500">
                Start collecting data from your LinkedIn accounts.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {recentJobs.map((job) => (
                <Link key={job.id} href={`/dashboard/collections/${job.id}`}>
                  <div className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                          {getStatusIcon(job.status)}
                          <span className="ml-1">{job.status}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {job.platform_name.charAt(0).toUpperCase() + job.platform_name.slice(1)} Collection
                          </p>
                          <p className="text-sm text-gray-500">
                            {job.records_collected.toLocaleString()} records collected
                            {job.status === 'completed' && job.records_collected > 0 && (
                              <span className="ml-2 text-blue-600 font-medium">
                                → Click to export to storage
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">
                          {job.completed_at ? 
                            new Date(job.completed_at).toLocaleString() :
                            new Date(job.created_at).toLocaleString()
                          }
                        </p>
                        {job.status === 'completed' && job.records_collected > 0 && (
                          <p className="text-xs text-blue-600 mt-1">
                            Ready to export
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
