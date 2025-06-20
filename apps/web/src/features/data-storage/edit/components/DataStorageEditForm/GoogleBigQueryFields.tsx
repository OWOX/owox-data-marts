import { useForm, Controller } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { DataStorageType } from '../../../shared';
import { Separator } from '@owox/ui/components/separator';
import { Label } from '@owox/ui/components/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';
import type { DataStorageFormData } from '../../../shared/types/data-storage.schema.ts';
import { Combobox } from '../../../../../components/Combobox/combobox.tsx';

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
            <Controller
              name='config.location'
              control={form.control}
              defaultValue='US'
              rules={{ required: true }}
              render={({ field }) => {
                // Create location options array with group information
                const locationOptions = [
                  // North America
                  { value: 'US', label: 'US (multiple regions)', group: 'North America' },
                  { value: 'northamerica-northeast1', label: 'Montréal', group: 'North America' },
                  { value: 'northamerica-northeast2', label: 'Toronto', group: 'North America' },
                  { value: 'us-central1', label: 'Iowa', group: 'North America' },
                  { value: 'us-east1', label: 'South Carolina', group: 'North America' },
                  { value: 'us-east4', label: 'Northern Virginia', group: 'North America' },
                  { value: 'us-east5', label: 'Columbus', group: 'North America' },
                  { value: 'us-west1', label: 'Oregon', group: 'North America' },
                  { value: 'us-west2', label: 'Los Angeles', group: 'North America' },
                  { value: 'us-west3', label: 'Salt Lake City', group: 'North America' },
                  { value: 'us-west4', label: 'Las Vegas', group: 'North America' },
                  // Europe
                  { value: 'EU', label: 'EU (multiple regions)', group: 'Europe' },
                  { value: 'europe-central2', label: 'Warsaw', group: 'Europe' },
                  { value: 'europe-north1', label: 'Finland', group: 'Europe' },
                  { value: 'europe-southwest1', label: 'Madrid', group: 'Europe' },
                  { value: 'europe-west1', label: 'Belgium', group: 'Europe' },
                  { value: 'europe-west2', label: 'London', group: 'Europe' },
                  { value: 'europe-west3', label: 'Frankfurt', group: 'Europe' },
                  { value: 'europe-west4', label: 'Netherlands', group: 'Europe' },
                  { value: 'europe-west6', label: 'Zurich', group: 'Europe' },
                  { value: 'europe-west8', label: 'Milan', group: 'Europe' },
                  { value: 'europe-west9', label: 'Paris', group: 'Europe' },
                  { value: 'europe-west12', label: 'Turin', group: 'Europe' },
                  // Asia Pacific
                  { value: 'asia-east1', label: 'Taiwan', group: 'Asia Pacific' },
                  { value: 'asia-east2', label: 'Hong Kong', group: 'Asia Pacific' },
                  { value: 'asia-northeast1', label: 'Tokyo', group: 'Asia Pacific' },
                  { value: 'asia-northeast2', label: 'Osaka', group: 'Asia Pacific' },
                  { value: 'asia-northeast3', label: 'Seoul', group: 'Asia Pacific' },
                  { value: 'asia-south1', label: 'Mumbai', group: 'Asia Pacific' },
                  { value: 'asia-south2', label: 'Delhi', group: 'Asia Pacific' },
                  { value: 'asia-southeast1', label: 'Singapore', group: 'Asia Pacific' },
                  { value: 'asia-southeast2', label: 'Jakarta', group: 'Asia Pacific' },
                  { value: 'australia-southeast1', label: 'Sydney', group: 'Asia Pacific' },
                  { value: 'australia-southeast2', label: 'Melbourne', group: 'Asia Pacific' },
                  // Other
                  { value: 'southamerica-east1', label: 'São Paulo', group: 'Other' },
                  { value: 'southamerica-west1', label: 'Santiago', group: 'Other' },
                  { value: 'me-central1', label: 'Doha', group: 'Other' },
                  { value: 'me-central2', label: 'Dammam', group: 'Other' },
                  { value: 'me-west1', label: 'Tel Aviv', group: 'Other' },
                  { value: 'africa-south1', label: 'Johannesburg', group: 'Other' },
                ];

                return (
                  <Combobox
                    options={locationOptions}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder='Select a location'
                    emptyMessage='No locations found'
                    className='w-full'
                  />
                );
              }}
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className='ml-1.5 inline-block h-4 w-4 cursor-help text-gray-500' />
                  </TooltipTrigger>
                  <TooltipContent className='max-w-sm text-sm'>
                    <p>
                      A Service Account Key is a JSON credential file that provides authentication
                      to Google BigQuery.
                    </p>
                    <p className='mt-1'>
                      To get one, go to the Google Cloud Console, navigate to IAM & Admin &gt;
                      Service Accounts, create or select a service account, and generate a new JSON
                      key.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
