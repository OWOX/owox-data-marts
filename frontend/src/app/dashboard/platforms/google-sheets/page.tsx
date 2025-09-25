"use client"

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { PlusIcon, DocumentIcon, ExternalLinkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface GoogleSheetsCredential {
  id: number
  platform_display_name: string
  account_name: string
  is_valid: boolean
  last_validated_at: string
  created_at: string
}

interface SpreadsheetResult {
  spreadsheet_id: string
  spreadsheet_url: string
  title: string
}

export default function GoogleSheetsPage() {
  const [credentials, setCredentials] = useState<GoogleSheetsCredential[]>([])
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddCredential, setShowAddCredential] = useState(false)
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [selectedCredential, setSelectedCredential] = useState<number | null>(null)

  const credentialForm = useForm()
  const sheetForm = useForm()

  useEffect(() => {
    fetchCredentials()
  }, [])

  const fetchCredentials = async () => {
    try {
      const response = await fetch('/api/platform-credentials?platform=google_sheets')
      if (response.ok) {
        const data = await response.json()
        setCredentials(data)
      }
    } catch (error) {
      console.error('Error fetching credentials:', error)
    }
  }

  const handleAddCredential = async (data: any) => {
    setLoading(true)
    try {
      const credentialsPayload = data.auth_type === 'service_account' 
        ? { service_account_key: JSON.parse(data.service_account_json) }
        : {
            client_id: data.client_id,
            client_secret: data.client_secret,
            refresh_token: data.refresh_token,
            access_token: data.access_token
          }

      const response = await fetch('/api/platforms/google-sheets/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_name: 'google_sheets',
          platform_display_name: data.display_name,
          credentials: credentialsPayload,
          account_name: data.account_name
        })
      })

      if (response.ok) {
        const newCredential = await response.json()
        setCredentials([...credentials, newCredential])
        setShowAddCredential(false)
        credentialForm.reset()
        toast.success('Google Sheets credentials added successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to add credentials: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error adding Google Sheets credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSpreadsheet = async (data: any) => {
    if (!selectedCredential) {
      toast.error('Please select a credential first')
      return
    }

    setLoading(true)
    try {
      const headers = data.headers ? data.headers.split(',').map((h: string) => h.trim()) : []
      
      const response = await fetch('/api/platforms/google-sheets/create-spreadsheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_credential_id: selectedCredential,
          title: data.title,
          headers: headers.length > 0 ? headers : undefined
        })
      })

      if (response.ok) {
        const result = await response.json()
        setSpreadsheets([...spreadsheets, result])
        setShowCreateSheet(false)
        sheetForm.reset()
        toast.success('Spreadsheet created successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to create spreadsheet: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error creating spreadsheet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Google Sheets Integration</h1>
            <p className="mt-2 text-sm text-gray-700">
              Connect your Google account to create and manage spreadsheets for data exports.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowAddCredential(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              Add Google Account
            </button>
            {selectedCredential && (
              <button
                onClick={() => setShowCreateSheet(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <DocumentIcon className="-ml-1 mr-2 h-5 w-5" />
                Create Spreadsheet
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Credential Form */}
      {showAddCredential && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add Google Sheets Account</h3>
          <form onSubmit={credentialForm.handleSubmit(handleAddCredential)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                {...credentialForm.register('display_name', { required: 'Display name is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="My Google Sheets Account"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Authentication Type</label>
              <select
                {...credentialForm.register('auth_type', { required: 'Authentication type is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select authentication type</option>
                <option value="service_account">Service Account (Recommended)</option>
                <option value="oauth2">OAuth2</option>
              </select>
            </div>

            {credentialForm.watch('auth_type') === 'service_account' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Service Account JSON</label>
                <textarea
                  {...credentialForm.register('service_account_json', { required: 'Service account JSON is required' })}
                  rows={6}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Paste your service account JSON key here"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Download this from your Google Cloud Console → Service Accounts
                </p>
              </div>
            )}

            {credentialForm.watch('auth_type') === 'oauth2' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client ID</label>
                  <input
                    type="text"
                    {...credentialForm.register('client_id', { required: 'Client ID is required' })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Client Secret</label>
                  <input
                    type="password"
                    {...credentialForm.register('client_secret', { required: 'Client secret is required' })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Access Token</label>
                  <input
                    type="password"
                    {...credentialForm.register('access_token', { required: 'Access token is required' })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Refresh Token</label>
                  <input
                    type="password"
                    {...credentialForm.register('refresh_token', { required: 'Refresh token is required' })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddCredential(false)
                  credentialForm.reset()
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Spreadsheet Form */}
      {showCreateSheet && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Spreadsheet</h3>
          <form onSubmit={sheetForm.handleSubmit(handleCreateSpreadsheet)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Spreadsheet Title</label>
              <input
                type="text"
                {...sheetForm.register('title', { required: 'Title is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="My Data Export"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Headers (Optional)</label>
              <input
                type="text"
                {...sheetForm.register('headers')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="Column1, Column2, Column3"
              />
              <p className="mt-1 text-xs text-gray-500">
                Comma-separated list of column headers
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateSheet(false)
                  sheetForm.reset()
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Spreadsheet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Credentials List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Connected Accounts</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {credentials.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-500">No Google Sheets accounts connected yet.</p>
            </div>
          ) : (
            credentials.map((credential) => (
              <div key={credential.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {credential.platform_display_name}
                    </h4>
                    <p className="text-sm text-gray-500">{credential.account_name}</p>
                    <div className="flex items-center mt-1">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          credential.is_valid
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {credential.is_valid ? 'Valid' : 'Invalid'}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        Added {new Date(credential.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setSelectedCredential(credential.id)}
                      className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md ${
                        selectedCredential === credential.id
                          ? 'border-primary-300 text-primary-700 bg-primary-50'
                          : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {selectedCredential === credential.id ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Created Spreadsheets */}
      {spreadsheets.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Created Spreadsheets</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {spreadsheets.map((sheet) => (
              <div key={sheet.spreadsheet_id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{sheet.title}</h4>
                    <p className="text-sm text-gray-500">ID: {sheet.spreadsheet_id}</p>
                  </div>
                  <a
                    href={sheet.spreadsheet_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ExternalLinkIcon className="-ml-0.5 mr-2 h-4 w-4" />
                    Open Sheet
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
