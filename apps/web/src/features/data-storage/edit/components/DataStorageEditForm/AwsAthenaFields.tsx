import { useForm } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { DataStorageType } from '../../../shared';
import { Separator } from '@owox/ui/components/separator';
import { Label } from '@owox/ui/components/label';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';

interface AwsAthenaFieldsProps {
  form: ReturnType<typeof useForm<DataStorageFormData>>;
}

export const AwsAthenaFields = ({ form }: AwsAthenaFieldsProps) => {
  const {
    register,
    formState: { errors },
  } = form;

  if (form.watch('type') !== DataStorageType.AWS_ATHENA) {
    return null;
  }

  return (
    <>
      <div className='space-y-6'>
        {/* Connection Settings */}
        <div className='space-y-4'>
          <h3 className='text-lg font-medium'>Connection Settings</h3>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='region' className='block text-sm font-medium text-gray-700'>
                Region
              </Label>
              <Input
                id='region'
                type='text'
                {...register('config.region')}
                className='mt-1 block w-full'
              />
              {errors.config && 'region' in errors.config && (
                <p className='mt-1 text-sm text-red-600'>{errors.config.region?.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor='database-name' className='block text-sm font-medium text-gray-700'>
                Database Name
              </Label>
              <Input
                id='database-name'
                type='text'
                {...register('config.databaseName')}
                className='mt-1 block w-full'
              />
              {errors.config && 'databaseName' in errors.config && (
                <p className='mt-1 text-sm text-red-600'>{errors.config.databaseName?.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor='output-bucket' className='block text-sm font-medium text-gray-700'>
                Output Bucket
              </Label>
              <Input
                id='output-bucket'
                type='text'
                {...register('config.outputBucket')}
                className='block w-full'
              />
              {errors.config && 'outputBucket' in errors.config && (
                <p className='mt-1 text-sm text-red-600'>{errors.config.outputBucket?.message}</p>
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
              <Label htmlFor='access-key-id' className='block text-sm font-medium text-gray-700'>
                Access Key ID
              </Label>
              <Input
                id='access-key-id'
                type='text'
                {...register('credentials.accessKeyId')}
                className='block w-full'
              />
              {errors.credentials && 'accessKeyId' in errors.credentials && (
                <p className='mt-1 text-sm text-red-600'>
                  {errors.credentials.accessKeyId?.message}
                </p>
              )}
            </div>
            <div>
              <Label
                htmlFor='secret-access-key'
                className='block text-sm font-medium text-gray-700'
              >
                Secret Access Key
              </Label>
              <Input
                id='secret-access-key'
                type='password'
                {...register('credentials.secretAccessKey')}
                className='block w-full'
              />
              {errors.credentials && 'secretAccessKey' in errors.credentials && (
                <p className='mt-1 text-sm text-red-600'>
                  {errors.credentials.secretAccessKey?.message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
