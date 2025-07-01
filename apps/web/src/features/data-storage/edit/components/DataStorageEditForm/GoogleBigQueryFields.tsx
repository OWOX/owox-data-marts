import { useForm, Controller } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { DataStorageType, SENSITIVE_KEYS } from '../../../shared';
import { Separator } from '@owox/ui/components/separator';
import { Label } from '@owox/ui/components/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';
import type { DataStorageFormData } from '../../../shared';
import { googleBigQueryLocationOptions } from '../../../shared';
import { Combobox } from '../../../../../shared/components/Combobox/combobox.tsx';
import { SecureJsonInput } from '../../../../../shared';

interface GoogleBigQueryFieldsProps {
  form: ReturnType<typeof useForm<DataStorageFormData>>;
}

export const GoogleBigQueryFields = ({ form }: GoogleBigQueryFieldsProps) => {
  const {
    register,
    formState: { errors },
  } = form;

  if (form.watch('type') !== DataStorageType.GOOGLE_BIGQUERY) {
    return null;
  }

  return (
    <div className='space-y-6'>
      {/* Connection Settings */}
      <div className='space-y-4'>
        <h3 className='text-lg font-medium'>Connection Settings</h3>
        <div className='space-y-4'>
          <div>
            <Label htmlFor='project-id' className='block text-sm font-medium text-gray-700'>
              Project ID<span className='ml-1 text-red-500'>*</span>
            </Label>
            <Input
              id='project-id'
              type='text'
              {...register('config.projectId', { required: true })}
              className='mt-1 block w-full'
            />
            {errors.config && 'projectId' in errors.config && (
              <p className='mt-1 text-sm text-red-600'>{errors.config.projectId?.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor='location' className='block text-sm font-medium text-gray-700'>
              Location<span className='ml-1 text-red-500'>*</span>
            </Label>
            <Controller
              name='config.location'
              control={form.control}
              defaultValue='US'
              rules={{ required: true }}
              render={({ field }) => (
                <Combobox
                  options={googleBigQueryLocationOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder='Select a location'
                  emptyMessage='No locations found'
                  className='w-full'
                />
              )}
            />
            {errors.config && 'location' in errors.config && (
              <p className='mt-1 text-sm text-red-600'>{errors.config.location?.message}</p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Authentication */}
      <div className='space-y-4'>
        <h3 className='text-lg font-medium'>Authentication</h3>
        <div className='space-y-1'>
          <Label htmlFor='service-account-key' className='block text-sm font-medium text-gray-700'>
            Service Account JSON
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className='ml-1.5 inline-block h-4 w-4 cursor-help text-gray-500' />
                </TooltipTrigger>
                <TooltipContent className='max-w-sm text-sm'>
                  <p>
                    A Service Account Key is a JSON credential file that provides authentication to
                    Google BigQuery.
                  </p>
                  <p className='mt-1'>
                    To get one, go to the Google Cloud Console, navigate to IAM & Admin &gt; Service
                    Accounts, create or select a service account, and generate a new JSON key.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <SecureJsonInput
            value={form.watch('credentials.serviceAccount')}
            onChange={value => {
              form.setValue('credentials.serviceAccount', value);
            }}
            keysToMask={SENSITIVE_KEYS}
          />
          {errors.credentials && 'serviceAccount' in errors.credentials && (
            <p className='mt-1 text-sm text-red-600'>
              {errors.credentials.serviceAccount?.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
