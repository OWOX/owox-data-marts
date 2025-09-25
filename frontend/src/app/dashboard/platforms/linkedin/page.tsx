"use client"

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { PlusIcon, TrashIcon, PlayIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface LinkedInCredential {
  id: number
  platform_display_name: string
  account_name: string
  is_valid: boolean
  last_validated_at: string
  created_at: string
}

interface LinkedInAccount {
  id: string
  name: string
  status: string
  currency: string
  type: string
}

export default function LinkedInPage() {
  const [credentials, setCredentials] = useState<LinkedInCredential[]>([])
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([])
  const [selectedCredential, setSelectedCredential] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAddCredential, setShowAddCredential] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  useEffect(() => {
    fetchCredentials()
  }, [])

  const fetchCredentials = async () => {
    try {
      const response = await fetch('/api/platform-credentials?platform=linkedin')
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
      const response = await fetch('/api/platforms/linkedin/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_name: 'linkedin',
          platform_display_name: data.display_name,
          credentials: {
            access_token: data.access_token
          },
          account_name: data.account_name
        })
      })

      if (response.ok) {
        const newCredential = await response.json()
        setCredentials([...credentials, newCredential])
        setShowAddCredential(false)
        reset()
        toast.success('LinkedIn credentials added successfully!')
      } else {
        const error = await response.json()
        toast.error(`Failed to add credentials: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error adding LinkedIn credentials')
    } finally {
      setLoading(false)
    }
  }

  const fetchAccounts = async (credentialId: number) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/platforms/linkedin/credentials/${credentialId}/accounts`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setAccounts(data)
        setSelectedCredential(credentialId)
      } else {
        toast.error('Failed to fetch LinkedIn accounts')
      }
    } catch (error) {
      toast.error('Error fetching accounts')
    } finally {
      setLoading(false)
    }
  }

  const startDataCollection = async (accountId: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/platforms/linkedin/collect-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          platform_credential_id: selectedCredential,
          account_urns: [`urn:li:sponsoredAccount:${accountId}`],
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          end_date: new Date(),
          fields: ['impressions', 'clicks', 'costInUsd', 'dateRange', 'pivotValues']
        })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(`Data collection started! ${result.records_collected} records collected.`)
      } else {
        const error = await response.json()
        toast.error(`Failed to collect data: ${error.detail}`)
      }
    } catch (error) {
      toast.error('Error starting data collection')
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
            <h1 className="text-2xl font-bold text-gray-900">LinkedIn Ads Integration</h1>
            <p className="mt-2 text-sm text-gray-700">
              Connect your LinkedIn Ads accounts to collect campaign data and analytics.
            </p>
          </div>
          <button
            onClick={() => setShowAddCredential(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Add LinkedIn Account
          </button>
        </div>
      </div>

      {/* Add Credential Form */}
      {showAddCredential && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Add LinkedIn Account</h3>
          <form onSubmit={handleSubmit(handleAddCredential)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input
                type="text"
                {...register('display_name', { required: 'Display name is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="My LinkedIn Account"
              />
              {errors.display_name && (
                <p className="mt-1 text-sm text-red-600">{errors.display_name.message as string}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Access Token</label>
              <input
                type="password"
                {...register('access_token', { required: 'Access token is required' })}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="LinkedIn API Access Token"
              />
              {errors.access_token && (
                <p className="mt-1 text-sm text-red-600">{errors.access_token.message as string}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Account Name (Optional)</label>
              <input
                type="text"
                {...register('account_name')}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                placeholder="Account friendly name"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddCredential(false)
                  reset()
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

      {/* Credentials List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Connected Accounts</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {credentials.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-gray-500">No LinkedIn accounts connected yet.</p>
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
                      onClick={() => fetchAccounts(credential.id)}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      View Accounts
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Accounts List */}
      {selectedCredential && accounts.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">LinkedIn Ad Accounts</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {accounts.map((account) => (
              <div key={account.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{account.name}</h4>
                    <p className="text-sm text-gray-500">
                      Status: {account.status} | Currency: {account.currency} | Type: {account.type}
                    </p>
                  </div>
                  <button
                    onClick={() => startDataCollection(account.id)}
                    disabled={loading}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                  >
                    <PlayIcon className="-ml-0.5 mr-2 h-4 w-4" />
                    Collect Data
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
