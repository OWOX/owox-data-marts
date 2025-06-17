import { useForm } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { DataStorageType } from '../../../shared';
import { Separator } from '@owox/ui/components/separator';
import { Label } from '@owox/ui/components/label';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';

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
              Project ID
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
              Location
            </Label>
            <Input
              id='location'
              type='text'
              {...register('config.location', { required: true })}
              className='mt-1 block w-full'
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
        <div className='space-y-4'>
          <div>
            <Label
              htmlFor='service-account-key'
              className='block text-sm font-medium text-gray-700'
            >
              Service Account Key
            </Label>
            <Textarea
              id='service-account-key'
              placeholder={'Paste your service account key here.'}
              {...register('credentials.serviceAccount', { required: true })}
              className='mt-1 block min-h-[120px] w-full resize-none'
            />
            {errors.credentials && 'serviceAccount' in errors.credentials && (
              <p className='mt-1 text-sm text-red-600'>
                {errors.credentials.serviceAccount?.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
