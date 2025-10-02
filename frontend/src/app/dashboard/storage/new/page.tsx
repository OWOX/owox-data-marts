'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from 'react-query'
import { storageApi } from '@/lib/api/storage'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { 
  StorageType, 
  StorageDestinationCreate, 
  SchemaField,
  CsvConfig,
  PostgresConfig,
  BigQueryConfig
} from '@/types/storage'
import { 
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const STORAGE_TYPE_INFO = {
  [StorageType.CSV]: {
    name: 'CSV File',
    icon: '📄',
    description: 'Simple file-based storage with merge capabilities'
  },
  [StorageType.POSTGRES]: {
    name: 'PostgreSQL',
    icon: '🐘', 
    description: 'Full-featured database with ACID transactions'
  },
  [StorageType.BIGQUERY]: {
    name: 'Google BigQuery',
    icon: '📊',
    description: 'Cloud data warehouse for large-scale analytics'
  },
  [StorageType.SHEETS]: {
    name: 'Google Sheets',
    icon: '📋',
    description: 'Cloud spreadsheet for collaborative data management'
  },
  [StorageType.ATHENA]: {
    name: 'AWS Athena',
    icon: '☁️',
    description: 'Serverless query service for S3 data'
  }
}

export default function NewStorageDestinationPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<Partial<StorageDestinationCreate>>({
    storage_type: StorageType.CSV,
    unique_key_columns: [],
    schema_definition: []
  })
  const [configValidation, setConfigValidation] = useState<any>(null)
  const [isValidating, setIsValidating] = useState(false)

  const { data: storageTypes = [] } = useQuery(
    'storage-types',
    storageApi.getSupportedTypes
  )

  const { data: credentials = [] } = useQuery(
    'platform-credentials',
    platformCredentialsApi.getAll
  )

  const createMutation = useMutation(storageApi.createDestination, {
    onSuccess: (destination) => {
      console.log('✅ API SUCCESS - Destination created:', destination)
      toast.success('Storage destination created successfully')
      router.push(`/dashboard/storage/${destination.id}`)
    },
    onError: (error: any) => {
      console.log('❌ API ERROR - Full error object:', error)
      console.log('Error response:', error.response)
      console.log('Error response data:', error.response?.data)
      console.log('Error status:', error.response?.status)
      console.log('Error message:', error.message)
      
      // Handle different error response formats safely
      let errorMessage = 'Failed to create storage destination'
      if (error.response?.data?.detail) {
        console.log('Detailed error breakdown:', error.response.data.detail)
        if (Array.isArray(error.response.data.detail)) {
          // Handle FastAPI validation error arrays - show detailed info
          const messages = error.response.data.detail.map((err: any, index: number) => {
            console.log(`Error ${index}:`, err)
            if (typeof err === 'string') {
              return err
            } else if (err && typeof err === 'object') {
              const field = err.loc ? err.loc.join('.') : 'unknown field'
              const message = err.msg || 'Validation error'
              console.log(`Field "${field}" has error: ${message}`)
              return `${field}: ${message}`
            }
            return 'Validation error'
          })
          errorMessage = messages.join(', ')
        } else if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail
        } else {
          errorMessage = 'Invalid request format'
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      console.log('Final error message:', errorMessage)
      toast.error(errorMessage)
    }
  })

  const validateConfig = async () => {
    if (!formData.storage_type || !formData.configuration) {
      console.log('⚠️ Skipping validation - missing storage_type or configuration')
      console.log('storage_type:', formData.storage_type)
      console.log('configuration:', formData.configuration)
      return
    }
    
    console.log('🔍 Starting config validation...')
    console.log('Validating storage_type:', formData.storage_type)
    console.log('Validating configuration:', formData.configuration)
    
    setIsValidating(true)
    try {
      const result = await storageApi.validateConfig(formData.storage_type, formData.configuration)
      console.log('✅ Validation result:', result)
      setConfigValidation(result)
    } catch (error: any) {
      console.log('❌ Validation error:', error)
      console.log('Error response:', error.response?.data)
      
      // Handle different error response formats
      let errorMessages = []
      if (error.response?.data?.detail) {
        // Handle FastAPI validation errors
        if (Array.isArray(error.response.data.detail)) {
          errorMessages = error.response.data.detail.map((err: any) => 
            typeof err === 'string' ? err : err?.msg || JSON.stringify(err)
          )
        } else {
          errorMessages = [error.response.data.detail]
        }
      } else {
        errorMessages = ['Validation failed: ' + (error.message || 'Unknown error')]
      }
      
      setConfigValidation({ is_valid: false, errors: errorMessages })
    } finally {
      setIsValidating(false)
    }
  }

  useEffect(() => {
    if (currentStep === 3) {
      validateConfig()
    }
  }, [currentStep, formData.configuration])

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = () => {
    console.log('=== CREATE DESTINATION DEBUG ===')
    console.log('Raw formData:', JSON.stringify(formData, null, 2))
    console.log('formData.name:', formData.name)
    console.log('formData.storage_type:', formData.storage_type)
    console.log('formData.configuration:', formData.configuration)
    console.log('formData.unique_key_columns:', formData.unique_key_columns)
    console.log('Configuration type:', typeof formData.configuration)
    console.log('Configuration is null?', formData.configuration === null)
    console.log('Configuration is undefined?', formData.configuration === undefined)
    console.log('Configuration is empty object?', formData.configuration && Object.keys(formData.configuration).length === 0)
    
    // More detailed validation
    if (!formData.name) {
      console.log('❌ VALIDATION FAILED: Missing name')
      toast.error('Please enter a destination name')
      return
    }
    console.log('✅ Name validation passed:', formData.name)
    
    if (!formData.storage_type) {
      console.log('❌ VALIDATION FAILED: Missing storage_type')
      toast.error('Please select a storage type')
      return
    }
    console.log('✅ Storage type validation passed:', formData.storage_type)
    
    if (!formData.configuration) {
      console.log('❌ VALIDATION FAILED: Missing configuration')
      console.log('Configuration value:', formData.configuration)
      toast.error('Please configure the storage connection details')
      return
    }
    console.log('✅ Configuration exists')

    // Validate required fields based on storage type
    const config = formData.configuration as any
    console.log('Config object for validation:', config)
    
    if (formData.storage_type === StorageType.POSTGRES) {
      console.log('Validating PostgreSQL configuration...')
      const required = ['host', 'database', 'username', 'password', 'table_name']
      const configValues = required.map(field => ({ field, value: config[field], hasValue: !!config[field] }))
      console.log('Required field check:', configValues)
      
      const missing = required.filter(field => !config[field])
      console.log('Missing fields:', missing)
      
      if (missing.length > 0) {
        console.log('❌ VALIDATION FAILED: Missing PostgreSQL fields:', missing.join(', '))
        toast.error(`Missing required PostgreSQL fields: ${missing.join(', ')}`)
        return
      }
      console.log('✅ PostgreSQL validation passed')
    } else if (formData.storage_type === StorageType.CSV) {
      console.log('Validating CSV configuration...')
      console.log('file_path value:', config.file_path)
      if (!config.file_path) {
        console.log('❌ VALIDATION FAILED: Missing file_path')
        toast.error('Please enter a file path for CSV storage')
        return
      }
      console.log('✅ CSV validation passed')
    } else if (formData.storage_type === StorageType.BIGQUERY) {
      console.log('Validating BigQuery configuration...')
      const required = ['service_account_json', 'destination_project_id', 'destination_dataset_id', 'destination_table_name']
      const missing = required.filter(field => !config[field])
      console.log('Missing BigQuery fields:', missing)
      if (missing.length > 0) {
        console.log('❌ VALIDATION FAILED: Missing BigQuery fields:', missing.join(', '))
        toast.error(`Missing required BigQuery fields: ${missing.join(', ')}`)
        return
      }
      
      // Validate service account JSON format
      try {
        const serviceAccount = JSON.parse(config.service_account_json)
        if (!serviceAccount.type || !serviceAccount.project_id || !serviceAccount.private_key) {
          toast.error('Invalid service account JSON format')
          return
        }
      } catch (e) {
        toast.error('Invalid JSON in service account field')
        return
      }
      
      console.log('✅ BigQuery validation passed')
    }

    console.log('✅ ALL VALIDATIONS PASSED - Submitting to API...')
    
    // Clean the form data to ensure no invalid objects
    const cleanFormData = {
      ...formData,
      // Ensure unique_key_columns is always an array
      unique_key_columns: Array.isArray(formData.unique_key_columns) 
        ? formData.unique_key_columns.filter(col => typeof col === 'string' && col.trim() !== '')
        : [],
      // Ensure configuration is a valid object
      configuration: formData.configuration && typeof formData.configuration === 'object' 
        ? formData.configuration 
        : {}
    }
    
    console.log('Final payload:', JSON.stringify(cleanFormData, null, 2))
    
    createMutation.mutate(cleanFormData as StorageDestinationCreate)
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      <div className="flex items-center space-x-4">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step <= currentStep ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {step < currentStep ? (
                <CheckCircleIcon className="h-5 w-5" />
              ) : (
                <span className="text-sm font-medium">{step}</span>
              )}
            </div>
            {step < 4 && (
              <div className={`w-16 h-1 ml-4 ${
                step < currentStep ? 'bg-primary-600' : 'bg-gray-200'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Basic Information</h2>
        <p className="text-gray-600">Configure the basic settings for your storage destination.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Destination Name *
        </label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="e.g., LinkedIn Analytics Export"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Storage Type *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(STORAGE_TYPE_INFO).map(([type, info]) => (
            <div
              key={type}
              onClick={() => {
                console.log('🔄 STORAGE TYPE CHANGED to:', type)
                const newFormData = { ...formData, storage_type: type as StorageType }
                
                // Initialize configuration with defaults when storage type changes
                if (type === StorageType.POSTGRES) {
                  console.log('🔧 Initializing PostgreSQL configuration...')
                  newFormData.configuration = {
                    host: 'localhost',
                    port: 5432,
                    database: 'owox_data_marts',
                    username: 'postgres',
                    password: 'postgres',
                    table_name: 'analytics_data',
                    schema_name: 'public',
                    connection_timeout: 30,
                    create_table_if_not_exists: true,
                    use_transactions: false
                  }
                  console.log('✅ PostgreSQL config initialized:', newFormData.configuration)
                } else if (type === StorageType.CSV) {
                  console.log('🔧 Initializing CSV configuration...')
                  newFormData.configuration = {
                    file_path: '',
                    delimiter: ',',
                    encoding: 'utf-8',
                    append_mode: true,
                    enable_rotation: false
                  }
                  console.log('✅ CSV config initialized:', newFormData.configuration)
                } else if (type === StorageType.BIGQUERY) {
                  console.log('🔧 Initializing BigQuery configuration...')
                  newFormData.configuration = {
                    destination_project_id: '',
                    destination_dataset_id: '',
                    destination_table_name: '',
                    location: 'US',
                    write_disposition: 'WRITE_APPEND'
                  }
                  console.log('✅ BigQuery config initialized:', newFormData.configuration)
                }
                
                console.log('📋 Final formData after storage type change:', newFormData)
                setFormData(newFormData)
              }}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                formData.storage_type === type
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{info.icon}</span>
                <div>
                  <h3 className="font-medium text-gray-900">{info.name}</h3>
                  <p className="text-sm text-gray-500">{info.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          rows={3}
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="Optional description for this storage destination..."
        />
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Configuration</h2>
        <p className="text-gray-600">Configure the connection details for your {STORAGE_TYPE_INFO[formData.storage_type!]?.name}.</p>
      </div>

      {formData.storage_type === StorageType.CSV && renderCsvConfig()}
      {formData.storage_type === StorageType.POSTGRES && renderPostgresConfig()}
      {formData.storage_type === StorageType.BIGQUERY && renderBigQueryConfig()}
    </div>
  )

  const renderCsvConfig = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          File Path *
        </label>
        <input
          type="text"
          value={(formData.configuration as CsvConfig)?.file_path || ''}
          onChange={(e) => setFormData({
            ...formData,
            configuration: { ...(formData.configuration || {}), file_path: e.target.value } as CsvConfig
          })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="/path/to/your/data.csv"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Delimiter
          </label>
          <select
            value={(formData.configuration as CsvConfig)?.delimiter || ','}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), delimiter: e.target.value } as CsvConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value=",">Comma (,)</option>
            <option value=";">Semicolon (;)</option>
            <option value="\t">Tab</option>
            <option value="|">Pipe (|)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encoding
          </label>
          <select
            value={(formData.configuration as CsvConfig)?.encoding || 'utf-8'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), encoding: e.target.value } as CsvConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="utf-8">UTF-8</option>
            <option value="latin1">Latin-1</option>
            <option value="ascii">ASCII</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={(formData.configuration as CsvConfig)?.append_mode !== false}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), append_mode: e.target.checked } as CsvConfig
            })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="ml-2 text-sm text-gray-700">Append Mode</span>
        </label>

        <label className="flex items-center">
          <input
            type="checkbox"
            checked={(formData.configuration as CsvConfig)?.enable_rotation === true}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), enable_rotation: e.target.checked } as CsvConfig
            })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="ml-2 text-sm text-gray-700">Enable File Rotation</span>
        </label>
      </div>
    </div>
  )

  const renderPostgresConfig = () => (
    <div className="space-y-4">
      {/* Connection Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">Default Configuration</h4>
            <p className="text-sm text-blue-700 mt-1">
              Pre-filled with your development PostgreSQL database settings. Update as needed for your target environment.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Host *
          </label>
          <input
            type="text"
            value={(formData.configuration as PostgresConfig)?.host || 'localhost'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), host: e.target.value } as PostgresConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="localhost"
          />
          <p className="text-xs text-gray-500 mt-1">Use 'postgres' for Docker internal network</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Port
          </label>
          <input
            type="number"
            value={(formData.configuration as PostgresConfig)?.port || 5432}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), port: parseInt(e.target.value) } as PostgresConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Database Name *
        </label>
        <input
          type="text"
          value={(formData.configuration as PostgresConfig)?.database || 'owox_data_marts'}
          onChange={(e) => setFormData({
            ...formData,
            configuration: { ...(formData.configuration || {}), database: e.target.value } as PostgresConfig
          })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="owox_data_marts"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Username *
          </label>
          <input
            type="text"
            value={(formData.configuration as PostgresConfig)?.username || 'postgres'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), username: e.target.value } as PostgresConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="postgres"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password *
          </label>
          <input
            type="password"
            value={(formData.configuration as PostgresConfig)?.password || 'postgres'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), password: e.target.value } as PostgresConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="Enter password"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Table Name *
        </label>
        <input
          type="text"
          value={(formData.configuration as PostgresConfig)?.table_name || 'analytics_data'}
          onChange={(e) => setFormData({
            ...formData,
            configuration: { ...(formData.configuration || {}), table_name: e.target.value } as PostgresConfig
          })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="analytics_data"
        />
        <p className="text-xs text-gray-500 mt-1">Table will be created automatically if it doesn't exist</p>
      </div>

      {/* Advanced Options */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Advanced Options</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schema Name
            </label>
            <input
              type="text"
              value={(formData.configuration as PostgresConfig)?.schema_name || 'public'}
              onChange={(e) => setFormData({
                ...formData,
                configuration: { ...(formData.configuration || {}), schema_name: e.target.value } as PostgresConfig
              })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder="public"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connection Timeout (seconds)
            </label>
            <input
              type="number"
              value={(formData.configuration as PostgresConfig)?.connection_timeout || 30}
              onChange={(e) => setFormData({
                ...formData,
                configuration: { ...(formData.configuration || {}), connection_timeout: parseInt(e.target.value) } as PostgresConfig
              })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={(formData.configuration as PostgresConfig)?.create_table_if_not_exists !== false}
              onChange={(e) => setFormData({
                ...formData,
                configuration: { ...(formData.configuration || {}), create_table_if_not_exists: e.target.checked } as PostgresConfig
              })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-2 text-sm text-gray-700">Create table if not exists</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={(formData.configuration as PostgresConfig)?.use_transactions === true}
              onChange={(e) => setFormData({
                ...formData,
                configuration: { ...(formData.configuration || {}), use_transactions: e.target.checked } as PostgresConfig
              })}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="ml-2 text-sm text-gray-700">Use transactions</span>
          </label>
        </div>
      </div>
    </div>
  )

  const renderBigQueryConfig = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
        <div className="flex">
          <InformationCircleIcon className="h-5 w-5 text-blue-400 mr-2" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">Service Account Setup</p>
            <p className="mt-1">You'll need a GCP service account JSON key with BigQuery access. Get it from <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" className="underline">GCP Console</a>.</p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Service Account JSON *
        </label>
        <textarea
          value={(formData.configuration as BigQueryConfig)?.service_account_json || ''}
          onChange={(e) => setFormData({
            ...formData,
            configuration: { ...(formData.configuration || {}), service_account_json: e.target.value } as BigQueryConfig
          })}
          rows={6}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 font-mono text-xs"
          placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", ...}'
        />
        <p className="mt-1 text-xs text-gray-500">Paste your GCP service account JSON key file content</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Project ID *
        </label>
        <input
          type="text"
          value={(formData.configuration as BigQueryConfig)?.destination_project_id || ''}
          onChange={(e) => setFormData({
            ...formData,
            configuration: { ...(formData.configuration || {}), destination_project_id: e.target.value } as BigQueryConfig
          })}
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="my-gcp-project"
        />
        <p className="mt-1 text-xs text-gray-500">Your Google Cloud Platform project ID</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dataset ID *
          </label>
          <input
            type="text"
            value={(formData.configuration as BigQueryConfig)?.destination_dataset_id || ''}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), destination_dataset_id: e.target.value } as BigQueryConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="analytics_data"
          />
          <p className="mt-1 text-xs text-gray-500">Target dataset name</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Table Name *
          </label>
          <input
            type="text"
            value={(formData.configuration as BigQueryConfig)?.destination_table_name || ''}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), destination_table_name: e.target.value } as BigQueryConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="social_media_events"
          />
          <p className="mt-1 text-xs text-gray-500">Target table name</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Location
          </label>
          <select
            value={(formData.configuration as BigQueryConfig)?.location || 'US'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), location: e.target.value } as BigQueryConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="US">US (multi-region)</option>
            <option value="EU">EU (multi-region)</option>
            <option value="us-central1">us-central1</option>
            <option value="us-east1">us-east1</option>
            <option value="us-west1">us-west1</option>
            <option value="europe-west1">europe-west1</option>
            <option value="asia-northeast1">asia-northeast1</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">Dataset location</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Write Disposition
          </label>
          <select
            value={(formData.configuration as BigQueryConfig)?.write_disposition || 'WRITE_APPEND'}
            onChange={(e) => setFormData({
              ...formData,
              configuration: { ...(formData.configuration || {}), write_disposition: e.target.value } as BigQueryConfig
            })}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          >
            <option value="WRITE_APPEND">Append (add new rows)</option>
            <option value="WRITE_TRUNCATE">Truncate (replace all data)</option>
            <option value="WRITE_EMPTY">Empty (fail if table exists)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">How to write data</p>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Unique Key Configuration</h2>
        <p className="text-gray-600">Define the columns that uniquely identify each record for merge operations.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Unique Key Columns *
        </label>
        <div className="space-y-2">
          {(formData.unique_key_columns || []).map((column, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={column}
                onChange={(e) => {
                  const newColumns = [...(formData.unique_key_columns || [])]
                  newColumns[index] = e.target.value
                  setFormData({ ...formData, unique_key_columns: newColumns })
                }}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="e.g., user_id, date"
              />
              <button
                type="button"
                onClick={() => {
                  const newColumns = (formData.unique_key_columns || []).filter((_, i) => i !== index)
                  setFormData({ ...formData, unique_key_columns: newColumns })
                }}
                className="text-red-600 hover:text-red-800"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const newColumns = [...(formData.unique_key_columns || []), '']
              setFormData({ ...formData, unique_key_columns: newColumns })
            }}
            className="btn-outline text-sm"
          >
            Add Column
          </button>
        </div>
      </div>

      {/* Configuration Validation */}
      <div className="border rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Configuration Validation</h3>
        
        {isValidating ? (
          <div className="flex items-center space-x-2 text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            <span>Validating configuration...</span>
          </div>
        ) : configValidation ? (
          <div className="space-y-2">
            <div className={`flex items-center space-x-2 ${
              configValidation.is_valid ? 'text-green-600' : 'text-red-600'
            }`}>
              {configValidation.is_valid ? (
                <CheckCircleIcon className="h-5 w-5" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5" />
              )}
              <span>{configValidation.is_valid ? 'Configuration is valid' : 'Configuration has issues'}</span>
            </div>
            
            {configValidation.errors && configValidation.errors.length > 0 && (
              <div className="space-y-1">
                {configValidation.errors.map((error: any, index: number) => {
                  let errorText = 'Unknown error'
                  try {
                    if (typeof error === 'string') {
                      errorText = error
                    } else if (error && typeof error === 'object') {
                      errorText = error.msg || error.message || JSON.stringify(error)
                    } else {
                      errorText = String(error)
                    }
                  } catch (e) {
                    errorText = 'Error processing validation message'
                  }
                  
                  return (
                    <div key={index} className="text-sm text-red-600">
                      • {errorText}
                    </div>
                  )
                })}
              </div>
            )}
            
            {configValidation.warnings && configValidation.warnings.length > 0 && (
              <div className="space-y-1">
                {configValidation.warnings.map((warning: any, index: number) => {
                  let warningText = 'Unknown warning'
                  try {
                    if (typeof warning === 'string') {
                      warningText = warning
                    } else if (warning && typeof warning === 'object') {
                      warningText = warning.msg || warning.message || JSON.stringify(warning)
                    } else {
                      warningText = String(warning)
                    }
                  } catch (e) {
                    warningText = 'Error processing warning message'
                  }
                  
                  return (
                    <div key={index} className="text-sm text-yellow-600">
                      • {warningText}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-gray-600">
            <InformationCircleIcon className="h-5 w-5" />
            <span>Configuration will be validated automatically</span>
          </div>
        )}
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Review & Create</h2>
        <p className="text-gray-600">Review your configuration and create the storage destination.</p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Basic Information</h3>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-600">Name:</span> {formData.name}</div>
            <div><span className="text-gray-600">Type:</span> {STORAGE_TYPE_INFO[formData.storage_type!]?.name}</div>
            {formData.description && <div><span className="text-gray-600">Description:</span> {formData.description}</div>}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Unique Key Columns</h3>
          <div className="text-sm text-gray-600">
            {formData.unique_key_columns?.join(', ') || 'None specified'}
          </div>
        </div>

        {configValidation && (
          <div className={`rounded-lg p-4 ${
            configValidation.is_valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`flex items-center space-x-2 ${
              configValidation.is_valid ? 'text-green-800' : 'text-red-800'
            }`}>
              {configValidation.is_valid ? (
                <CheckCircleIcon className="h-5 w-5" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5" />
              )}
              <span className="font-medium">
                {configValidation.is_valid ? 'Ready to create' : 'Issues detected'}
              </span>
            </div>
            {!configValidation.is_valid && configValidation.errors && (
              <div className="mt-2 text-sm text-red-700">
                Please resolve the configuration issues before proceeding.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Storage Destination</h1>
          <p className="text-gray-600">Set up a new data storage destination</p>
        </div>
      </div>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Form Content */}
      <div className="card">
        <div className="card-body">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={currentStep === 1 ? () => router.back() : handleBack}
          className="btn-outline"
        >
          {currentStep === 1 ? 'Cancel' : 'Back'}
        </button>

        <div className="space-x-3">
          {currentStep < 4 ? (
            <button onClick={handleNext} className="btn-primary">
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createMutation.isLoading || (configValidation && !configValidation.is_valid)}
              className="btn-primary"
            >
              {createMutation.isLoading ? 'Creating...' : 'Create Destination'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
