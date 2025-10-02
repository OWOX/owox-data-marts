'use client'

import { useState, useEffect } from 'react'
import { 
  ArrowLeftIcon as ArrowLeft, 
  LightBulbIcon as Lightbulb, 
  CheckCircleIcon as CheckCircle, 
  ExclamationTriangleIcon as AlertCircle, 
  CogIcon as Settings 
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { platformSchemasApi, dataMartsApi, storageApi, connectorsApi } from '@/lib/api'

interface Platform {
  platform_name: string
  display_name: string
  description: string
  field_categories: string[]
}

interface ConnectorTemplate {
  name: string
  display_name: string
  description: string
  platform: string
  connector_type: string
}

interface StorageDestination {
  id: number
  name: string
  storage_type: string
  description?: string
}

interface DataMart {
  id: number
  title: string
  description?: string
}

export default function NewConnectorPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [templates, setTemplates] = useState<ConnectorTemplate[]>([])
  const [dataMarts, setDataMarts] = useState<DataMart[]>([])
  const [storageDestinations, setStorageDestinations] = useState<StorageDestination[]>([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    connector_type: 'platform_to_storage',
    source_platform: '',
    data_mart_id: '',
    storage_destination_id: '',
    platform_credential_id: '',
    template: '',
    source_config: {
      fields: [] as string[],
      date_range_days: 7,
      pivot_by: [] as string[]
    },
    schedule_config: {
      enabled: false,
      type: 'interval',
      interval_minutes: 60,
      cron_expression: '0 9 * * *'
    }
  })

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      const [platformsData, templatesData, dataMartsData, storageData] = await Promise.all([
        platformSchemasApi.getPlatforms(),
        platformSchemasApi.getTemplates(),
        dataMartsApi.getAll(),
        storageApi.getAll()
      ])

      setPlatforms(platformsData || [])
      setTemplates(templatesData.templates || templatesData || [])
      setDataMarts(dataMartsData || [])
      setStorageDestinations(storageData || [])
    } catch (error) {
      console.error('Error fetching initial data:', error)
      // Set empty arrays on error
      setPlatforms([])
      setTemplates([])
      setDataMarts([])
      setStorageDestinations([])
    }
  }

  const applyTemplate = async (templateName: string) => {
    try {
      const templateConfig = await platformSchemasApi.applyTemplate(templateName)

      setFormData(prev => ({
        ...prev,
        name: templateConfig.applied_config.name,
        description: templateConfig.applied_config.description,
        connector_type: templateConfig.applied_config.connector_type,
        source_platform: templateConfig.applied_config.source_platform,
        source_config: {
          ...prev.source_config,
          ...templateConfig.applied_config.source_config
        },
        template: templateName
      }))
    } catch (error) {
      console.error('Error applying template:', error)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const connector = await connectorsApi.create({
        ...formData,
        data_mart_id: parseInt(formData.data_mart_id),
        storage_destination_id: parseInt(formData.storage_destination_id),
        platform_credential_id: formData.platform_credential_id ? parseInt(formData.platform_credential_id) : null
      })

      router.push(`/dashboard/connectors/${connector.id}`)
    } catch (error) {
      console.error('Error creating connector:', error)
      alert('Failed to create connector. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3, 4].map((stepNumber) => (
        <div key={stepNumber} className="flex items-center">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
            stepNumber <= step ? 'bg-blue-600 text-white' : 
            stepNumber === step + 1 ? 'bg-blue-100 text-blue-600' :
            'bg-gray-200 text-gray-400'
          }`}>
            {stepNumber < step ? <CheckCircle className="w-4 h-4" /> : stepNumber}
          </div>
          {stepNumber < 4 && (
            <div className={`w-16 h-0.5 ${stepNumber < step ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose a Platform</h2>
        <p className="text-gray-600">Select the data source platform for your connector</p>
      </div>

      {/* Templates Section */}
      {templates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Lightbulb className="w-5 h-5 text-yellow-500 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Quick Start Templates</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.slice(0, 4).map((template) => (
              <button
                key={template.name}
                onClick={() => {
                  applyTemplate(template.name)
                  setStep(2)
                }}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm text-left transition-all"
              >
                <h4 className="font-medium text-gray-900">{template.display_name}</h4>
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                <div className="flex items-center mt-2 text-xs text-blue-600">
                  <span className="bg-blue-100 px-2 py-1 rounded">{template.platform}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-gray-200 mt-6 pt-6">
            <p className="text-sm text-gray-500 text-center">Or configure manually below</p>
          </div>
        </div>
      )}

      {/* Platform Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {platforms.map((platform) => (
          <button
            key={platform.platform_name}
            onClick={() => {
              setFormData(prev => ({ ...prev, source_platform: platform.platform_name }))
              setStep(2)
            }}
            className={`p-6 border-2 rounded-lg text-left transition-all ${
              formData.source_platform === platform.platform_name
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {platform.display_name}
            </h3>
            <p className="text-gray-600 text-sm mb-3">{platform.description}</p>
            <div className="flex flex-wrap gap-1">
              {platform.field_categories.map((category) => (
                <span
                  key={category}
                  className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                >
                  {category}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Basic Configuration</h2>
        <p className="text-gray-600">Configure the basic settings for your connector</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Connector Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., LinkedIn Daily Performance Data"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder="Describe what this connector does..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Data Mart *
          </label>
          <select
            value={formData.data_mart_id}
            onChange={(e) => setFormData(prev => ({ ...prev, data_mart_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a data mart</option>
            {dataMarts.map((mart) => (
              <option key={mart.id} value={mart.id}>
                {mart.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Storage Destination *
          </label>
          <select
            value={formData.storage_destination_id}
            onChange={(e) => setFormData(prev => ({ ...prev, storage_destination_id: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select a storage destination</option>
            {storageDestinations.map((dest) => (
              <option key={dest.id} value={dest.id}>
                {dest.name} ({dest.storage_type})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Configuration</h2>
        <p className="text-gray-600">Configure what data to extract and how often</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Date Range (days)
          </label>
          <input
            type="number"
            value={formData.source_config.date_range_days}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              source_config: { ...prev.source_config, date_range_days: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
            max="365"
          />
          <p className="text-sm text-gray-500 mt-1">How many days of historical data to fetch</p>
        </div>

        {formData.source_platform === 'linkedin' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Fields
            </label>
            <div className="space-y-2">
              {['impressions', 'clicks', 'costInUsd', 'externalWebsiteConversions'].map((field) => (
                <label key={field} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.source_config.fields.includes(field)}
                    onChange={(e) => {
                      const fields = e.target.checked
                        ? [...formData.source_config.fields, field]
                        : formData.source_config.fields.filter(f => f !== field)
                      setFormData(prev => ({
                        ...prev,
                        source_config: { ...prev.source_config, fields }
                      }))
                    }}
                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">{field}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Schedule & Review</h2>
        <p className="text-gray-600">Configure scheduling and review your connector</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Schedule Configuration */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Schedule Settings</h3>
          
          <div className="space-y-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.schedule_config.enabled}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  schedule_config: { ...prev.schedule_config, enabled: e.target.checked }
                }))}
                className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium text-gray-700">Enable automatic scheduling</span>
            </label>

            {formData.schedule_config.enabled && (
              <div className="space-y-4 pl-7">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Schedule Type
                  </label>
                  <select
                    value={formData.schedule_config.type}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      schedule_config: { ...prev.schedule_config, type: e.target.value }
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="interval">Interval</option>
                    <option value="cron">Cron Expression</option>
                  </select>
                </div>

                {formData.schedule_config.type === 'interval' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Interval (minutes)
                    </label>
                    <input
                      type="number"
                      value={formData.schedule_config.interval_minutes}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        schedule_config: { ...prev.schedule_config, interval_minutes: parseInt(e.target.value) }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="5"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cron Expression
                    </label>
                    <input
                      type="text"
                      value={formData.schedule_config.cron_expression}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        schedule_config: { ...prev.schedule_config, cron_expression: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0 9 * * *"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Daily at 9 AM: 0 9 * * *
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Review Section */}
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Review Configuration</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium">{formData.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Platform:</span>
              <span className="font-medium">{formData.source_platform}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium">{formData.connector_type.replace('_', ' ')}</span>
            </div>
            {formData.template && (
              <div className="flex justify-between">
                <span className="text-gray-600">Template:</span>
                <span className="font-medium">{formData.template}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Schedule:</span>
              <span className="font-medium">
                {formData.schedule_config.enabled ? 
                  `${formData.schedule_config.type} - ${formData.schedule_config.type === 'interval' ? 
                    `${formData.schedule_config.interval_minutes}m` : 
                    formData.schedule_config.cron_expression
                  }` : 
                  'Manual only'
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const canProceed = () => {
    switch (step) {
      case 1: return formData.source_platform !== ''
      case 2: return formData.name && formData.data_mart_id && formData.storage_destination_id
      case 3: return formData.source_config.fields.length > 0 || formData.source_platform !== 'linkedin'
      case 4: return true
      default: return false
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <Link
              href="/dashboard/connectors"
              className="mr-4 p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Connector</h1>
              <p className="mt-1 text-sm text-gray-500">
                Set up a new data synchronization connector
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderStepIndicator()}

        <div className="bg-white shadow rounded-lg p-8">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Navigation */}
          <div className="flex justify-between pt-8 mt-8 border-t border-gray-200">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                step === 1
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Previous
            </button>

            <div className="space-x-3">
              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    canProceed()
                      ? 'text-white bg-blue-600 hover:bg-blue-700'
                      : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                  }`}
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading || !canProceed()}
                  className={`px-6 py-2 text-sm font-medium rounded-md ${
                    loading || !canProceed()
                      ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                      : 'text-white bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {loading ? 'Creating...' : 'Create Connector'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
