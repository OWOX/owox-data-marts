"use client"

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { PlusIcon, DatabaseIcon, TableCellsIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface BigQueryCredential {
  id: number
  platform_display_name: string
  account_name: string
  account_id: string
  is_valid: boolean
  last_validated_at: string
  created_at: string
}

interface Dataset {
  dataset_id: string
  project_id: string
  location: string
}

interface Table {
  table_id: string
  dataset_id: string
  project_id: string
  schema: { name: string; type: string }[]
}

export default function GoogleBigQueryPage() {
  const [credentials, setCredentials] = useState<BigQueryCredential[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddCredential, setShowAddCredential] = useState(false)
  const [showCreateDataset, setShowCreateDataset] = useState(false)
  const [showCreateTable, setShowCreateTable] = useState(false)
  const [selectedCredential, setSelectedCredential] = useState<number | null>(null)
  const [selectedDataset, setSelectedDataset] = useState<string>('')

  const credentialForm = useForm()
  const datasetForm = useForm()
  const tableForm = useForm()

  useEffect(() => {
    fetchCredentials()
  }, [])

  const fetchCredentials = async () => {
    try {
      const response = await fetch('/api/platform-credentials?platform=google_bigquery')
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
      const credentialsPayload = {
        service_account_key: JSON.parse(data.service_account_json),
        project_id: data.project_id
      }

      const response = await fetch('/api/platforms/google-bigquery/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_name: 'google_bigquery',
          platform_display_name: data.display_name,
          credentials: credentialsPayload,
          account_name: data.account_name || data.project_id
        })
      })

      if (response.ok) {
        const newCredential = await response.json()
        setCredentials([...credentials, newCredential])
        setShowAddCredential(false)
        credentialForm.reset()
        toast.success('Google BigQuery credentials added successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to add credentials: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error adding Google BigQuery credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDataset = async (data: any) => {
    if (!selectedCredential) {
      toast.error('Please select a credential first')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/platforms/google-bigquery/create-dataset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_credential_id: selectedCredential,
          dataset_id: data.dataset_id,
          description: data.description
        })
      })

      if (response.ok) {
        const result = await response.json()
        setDatasets([...datasets, result])
        setShowCreateDataset(false)
        datasetForm.reset()
        toast.success('Dataset created successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to create dataset: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error creating dataset')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTable = async (data: any) => {
    if (!selectedCredential || !selectedDataset) {
      toast.error('Please select a credential and dataset first')
      return
    }

    setLoading(true)
    try {
      // Parse schema from form input
      const schemaLines = data.schema.split('\n').filter((line: string) => line.trim())
      const schema = schemaLines.map((line: string) => {
        const [name, type] = line.split(':').map((s: string) => s.trim())
        return { name, type: type || 'STRING' }
      })

      const response = await fetch('/api/platforms/google-bigquery/create-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_credential_id: selectedCredential,
          dataset_id: selectedDataset,
          table_id: data.table_id,
          schema: schema
        })
      })

      if (response.ok) {
        const result = await response.json()
        setTables([...tables, result])
        setShowCreateTable(false)
        tableForm.reset()
        toast.success('Table created successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to create table: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error creating table')
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
            <h1 className="text-2xl font-bold text-gray-900">Google BigQuery Integration</h1>
            <p className="mt-2 text-sm text-gray-700">
              Connect your Google BigQuery project to store and analyze large datasets.
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowAddCredential(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              Add BigQuery Project
            </button>
            {selectedCredential && (
              <>
                <button
                  onClick={() => setShowCreateDataset(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
                >
                  <DatabaseIcon className="-ml-1 mr-2 h-5 w-5" />
                  Create Dataset
                </button>
                {selectedDataset && (
                  <button
                    onClick={() => setShowCreateTable(true)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <TableCellsIcon className="-ml-1 mr-2 h-5 w-5" />
                    Create Table
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Credential Form */}
      {showAddCredential && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add BigQuery Project</h3>
          <form onSubmit={credentialForm.handleSubmit(handleAddCredential)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                {...credentialForm.register('display_name', { required: 'Display name is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="My BigQuery Project"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Project ID</label>
              <input
                type="text"
                {...credentialForm.register('project_id', { required: 'Project ID is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="my-bigquery-project"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Service Account JSON</label>
              <textarea
                {...credentialForm.register('service_account_json', { required: 'Service account JSON is required' })}
                rows={8}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                placeholder="Paste your service account JSON key here"
              />
              <p className="mt-1 text-xs text-gray-500">
                Download this from your Google Cloud Console → Service Accounts
              </p>
            </div>

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
                {loading ? 'Adding...' : 'Add Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Dataset Form */}
      {showCreateDataset && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create Dataset</h3>
          <form onSubmit={datasetForm.handleSubmit(handleCreateDataset)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Dataset ID</label>
              <input
                type="text"
                {...datasetForm.register('dataset_id', { required: 'Dataset ID is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="my_dataset"
              />
              <p className="mt-1 text-xs text-gray-500">
                Use lowercase letters, numbers, and underscores only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
              <textarea
                {...datasetForm.register('description')}
                rows={3}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="Dataset description"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateDataset(false)
                  datasetForm.reset()
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
                {loading ? 'Creating...' : 'Create Dataset'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Table Form */}
      {showCreateTable && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Create Table</h3>
          <form onSubmit={tableForm.handleSubmit(handleCreateTable)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Table ID</label>
              <input
                type="text"
                {...tableForm.register('table_id', { required: 'Table ID is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="my_table"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Schema</label>
              <textarea
                {...tableForm.register('schema', { required: 'Schema is required' })}
                rows={6}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                placeholder={`column1: STRING
column2: INTEGER
column3: FLOAT
column4: TIMESTAMP
column5: BOOLEAN`}
              />
              <p className="mt-1 text-xs text-gray-500">
                One column per line in format: column_name: TYPE
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateTable(false)
                  tableForm.reset()
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
                {loading ? 'Creating...' : 'Create Table'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Credentials List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Connected Projects</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {credentials.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-500">No BigQuery projects connected yet.</p>
            </div>
          ) : (
            credentials.map((credential) => (
              <div key={credential.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      {credential.platform_display_name}
                    </h4>
                    <p className="text-sm text-gray-500">Project: {credential.account_id}</p>
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

      {/* Datasets and Tables */}
      {datasets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Datasets */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Datasets</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {datasets.map((dataset) => (
                <div key={dataset.dataset_id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{dataset.dataset_id}</h4>
                      <p className="text-sm text-gray-500">Location: {dataset.location}</p>
                    </div>
                    <button
                      onClick={() => setSelectedDataset(dataset.dataset_id)}
                      className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm leading-4 font-medium rounded-md ${
                        selectedDataset === dataset.dataset_id
                          ? 'border-primary-300 text-primary-700 bg-primary-50'
                          : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {selectedDataset === dataset.dataset_id ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tables */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Tables</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {tables.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-gray-500">No tables created yet.</p>
                </div>
              ) : (
                tables.map((table) => (
                  <div key={`${table.dataset_id}.${table.table_id}`} className="px-6 py-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{table.table_id}</h4>
                      <p className="text-sm text-gray-500">Dataset: {table.dataset_id}</p>
                      <p className="text-sm text-gray-500">
                        Columns: {table.schema.length}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
