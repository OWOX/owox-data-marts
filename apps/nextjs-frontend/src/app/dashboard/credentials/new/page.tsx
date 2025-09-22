'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from 'react-query'
import { platformCredentialsApi } from '@/lib/api/platform-credentials'
import { SUPPORTED_PLATFORMS, getPlatformInfo } from '@/lib/platforms'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import toast from 'react-hot-toast'

const credentialSchema = z.object({
  platform_name: z.string().min(1, 'Please select a platform'),
  platform_display_name: z.string().min(1, 'Display name is required'),
  account_name: z.string().optional(),
  credentials: z.record(z.string(), z.any()),
})

type CredentialForm = z.infer<typeof credentialSchema>

export default function NewCredentialPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
  })

  const createMutation = useMutation(platformCredentialsApi.create, {
    onSuccess: () => {
      queryClient.invalidateQueries('platform-credentials')
      toast.success('Platform credentials added successfully!')
      router.push('/dashboard/credentials')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to add credentials')
    }
  })

  const platformName = watch('platform_name')
  const platformInfo = getPlatformInfo(platformName)

  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform)
    setValue('platform_name', platform)
    
    const info = getPlatformInfo(platform)
    if (info) {
      setValue('platform_display_name', info.display_name)
    }
  }

  const onSubmit = async (data: CredentialForm) => {
    setIsLoading(true)
    try {
      await createMutation.mutateAsync(data)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/dashboard/credentials" className="text-gray-400 hover:text-gray-600">
          <ArrowLeftIcon className="h-6 w-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Platform Credentials</h1>
          <p className="text-gray-600">Connect to your marketing platforms securely</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Platform Selection */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900">Select Platform</h3>
            <p className="text-sm text-gray-500">Choose the platform you want to connect</p>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SUPPORTED_PLATFORMS.map((platform) => (
                <div
                  key={platform.name}
                  className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
                    selectedPlatform === platform.name
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => handlePlatformChange(platform.name)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="text-2xl">{platform.icon}</div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900">
                        {platform.display_name}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {platform.description}
                      </p>
                    </div>
                  </div>
                  {selectedPlatform === platform.name && (
                    <div className="absolute top-2 right-2">
                      <div className="h-2 w-2 bg-primary-500 rounded-full"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {errors.platform_name && (
              <p className="mt-2 text-sm text-red-600">{errors.platform_name.message}</p>
            )}
          </div>
        </div>

        {/* Credential Configuration */}
        {platformInfo && (
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900">
                Configure {platformInfo.display_name}
              </h3>
              <p className="text-sm text-gray-500">
                Enter your API credentials for {platformInfo.display_name}
              </p>
            </div>
            <div className="card-body space-y-6">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Display Name
                </label>
                <input
                  {...register('platform_display_name')}
                  type="text"
                  className="input mt-1"
                  placeholder="e.g., My Facebook Ads Account"
                />
                {errors.platform_display_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.platform_display_name.message}</p>
                )}
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Account Name (Optional)
                </label>
                <input
                  {...register('account_name')}
                  type="text"
                  className="input mt-1"
                  placeholder="Friendly name for this account"
                />
              </div>

              {/* Platform-specific fields */}
              {platformInfo.fields.map((field) => (
                <div key={field.name}>
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    {...register(`credentials.${field.name}` as any)}
                    type={field.type}
                    className="input mt-1"
                    placeholder={field.placeholder}
                    required={field.required}
                  />
                  {field.description && (
                    <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                  )}
                </div>
              ))}

              {/* Documentation Link */}
              {platformInfo.documentation_url && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <p className="text-sm text-blue-800">
                    Need help finding your credentials?{' '}
                    <a
                      href={platformInfo.documentation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline hover:no-underline"
                    >
                      View {platformInfo.display_name} documentation
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        {selectedPlatform && (
          <div className="flex justify-end space-x-4">
            <Link href="/dashboard/credentials" className="btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? 'Adding...' : 'Add Credentials'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
