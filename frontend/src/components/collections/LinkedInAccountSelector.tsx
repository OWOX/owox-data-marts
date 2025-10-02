'use client'

import { useState, useEffect } from 'react'
import { dataCollectionApi } from '@/lib/api'
import { 
  CheckCircleIcon as CheckCircle,
  ExclamationTriangleIcon as AlertCircle,
  ArrowPathIcon as RefreshCw
} from '@heroicons/react/24/outline'

interface LinkedInAccount {
  id: string
  name: string
  status: string
  type: string
  totalBudget?: {
    amount: string
    currencyCode: string
  }
}

interface Props {
  credentialId: number | string
  selectedAccounts: string[]
  onAccountsChange: (accounts: string[]) => void
}

export function LinkedInAccountSelector({ credentialId, selectedAccounts, onAccountsChange }: Props) {
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (credentialId) {
      fetchAccounts()
    }
  }, [credentialId])

  const fetchAccounts = async () => {
    if (!credentialId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const data = await dataCollectionApi.getLinkedInAccounts(Number(credentialId))
      setAccounts(data || [])
    } catch (error: any) {
      console.error('Error fetching LinkedIn accounts:', error)
      console.error('Full error object:', error)
      
      // Handle different types of errors
      if (error.response) {
        const status = error.response.status
        const detail = error.response.data?.detail || error.response.statusText
        
        if (status === 403) {
          setError(`Access denied: ${detail}. The LinkedIn credential may not have proper permissions or may be expired.`)
        } else if (status === 404) {
          setError('LinkedIn credential not found. Please check that the credential exists and belongs to you.')
        } else if (status === 500) {
          setError(`Server error: ${detail}. There may be an issue with the LinkedIn credential or API connection.`)
        } else {
          setError(`Error ${status}: ${detail}`)
        }
      } else {
        setError(error.message || 'Failed to fetch accounts')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAccountToggle = (accountId: string) => {
    const isSelected = selectedAccounts.includes(accountId)
    if (isSelected) {
      onAccountsChange(selectedAccounts.filter(id => id !== accountId))
    } else {
      onAccountsChange([...selectedAccounts, accountId])
    }
  }

  const selectAll = () => {
    onAccountsChange(accounts.map(account => account.id))
  }

  const clearAll = () => {
    onAccountsChange([])
  }

  if (!credentialId) {
    return (
      <div className="text-sm text-gray-500 p-4 bg-gray-50 rounded-md">
        Select a LinkedIn credential first to load available accounts.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-50 rounded-md">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-600">Loading accounts...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={fetchAccounts}
            className="ml-auto text-red-400 hover:text-red-600"
            title="Retry"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center p-4 bg-gray-50 rounded-md">
        <p className="text-sm text-gray-600">No LinkedIn accounts found for this credential.</p>
        <button
          onClick={fetchAccounts}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
        >
          <RefreshCw className="h-4 w-4 inline mr-1" />
          Refresh
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="block text-sm font-medium text-gray-700">
          Select LinkedIn Accounts ({selectedAccounts.length} of {accounts.length} selected)
        </label>
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={fetchAccounts}
            className="text-sm text-gray-600 hover:text-gray-800"
            title="Refresh accounts"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border border-gray-300 rounded-md p-3 max-h-60 overflow-y-auto">
        <div className="space-y-2">
          {accounts.map((account) => (
            <label
              key={account.id}
              className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedAccounts.includes(account.id)}
                onChange={() => handleAccountToggle(account.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {account.name}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    account.status === 'ACTIVE' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {account.status}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1">
                  <p className="text-xs text-gray-500">
                    ID: {account.id}
                  </p>
                  <p className="text-xs text-gray-500">
                    Type: {account.type}
                  </p>
                  {account.totalBudget && (
                    <p className="text-xs text-gray-500">
                      Budget: {account.totalBudget.amount} {account.totalBudget.currencyCode}
                    </p>
                  )}
                </div>
              </div>
              {selectedAccounts.includes(account.id) && (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Select the LinkedIn ad accounts you want to collect data from.
      </p>
    </div>
  )
}
