import { useForm, Controller } from 'react-hook-form';
import { Input } from '@owox/ui/components/input';
import { Textarea } from '@owox/ui/components/textarea';
import { DataStorageType } from '../../../shared';
import { Separator } from '@owox/ui/components/separator';
import { Label } from '@owox/ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';
import { Info } from 'lucide-react';
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
            <Controller
              name='config.location'
              control={form.control}
              defaultValue='US'
              rules={{ required: true }}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id='location' className='flex w-full items-center'>
                    <SelectValue placeholder='Select a location' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>North America</SelectLabel>
                      <SelectItem value='US'>US (multiple regions)</SelectItem>
                      <SelectItem value='northamerica-northeast1'>Montréal</SelectItem>
                      <SelectItem value='northamerica-northeast2'>Toronto</SelectItem>
                      <SelectItem value='us-central1'>Iowa</SelectItem>
                      <SelectItem value='us-east1'>South Carolina</SelectItem>
                      <SelectItem value='us-east4'>Northern Virginia</SelectItem>
                      <SelectItem value='us-east5'>Columbus</SelectItem>
                      <SelectItem value='us-west1'>Oregon</SelectItem>
                      <SelectItem value='us-west2'>Los Angeles</SelectItem>
                      <SelectItem value='us-west3'>Salt Lake City</SelectItem>
                      <SelectItem value='us-west4'>Las Vegas</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Europe</SelectLabel>
                      <SelectItem value='EU'>EU (multiple regions)</SelectItem>
                      <SelectItem value='europe-central2'>Warsaw</SelectItem>
                      <SelectItem value='europe-north1'>Finland</SelectItem>
                      <SelectItem value='europe-southwest1'>Madrid</SelectItem>
                      <SelectItem value='europe-west1'>Belgium</SelectItem>
                      <SelectItem value='europe-west2'>London</SelectItem>
                      <SelectItem value='europe-west3'>Frankfurt</SelectItem>
                      <SelectItem value='europe-west4'>Netherlands</SelectItem>
                      <SelectItem value='europe-west6'>Zurich</SelectItem>
                      <SelectItem value='europe-west8'>Milan</SelectItem>
                      <SelectItem value='europe-west9'>Paris</SelectItem>
                      <SelectItem value='europe-west12'>Turin</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Asia Pacific</SelectLabel>
                      <SelectItem value='asia-east1'>Taiwan</SelectItem>
                      <SelectItem value='asia-east2'>Hong Kong</SelectItem>
                      <SelectItem value='asia-northeast1'>Tokyo</SelectItem>
                      <SelectItem value='asia-northeast2'>Osaka</SelectItem>
                      <SelectItem value='asia-northeast3'>Seoul</SelectItem>
                      <SelectItem value='asia-south1'>Mumbai</SelectItem>
                      <SelectItem value='asia-south2'>Delhi</SelectItem>
                      <SelectItem value='asia-southeast1'>Singapore</SelectItem>
                      <SelectItem value='asia-southeast2'>Jakarta</SelectItem>
                      <SelectItem value='australia-southeast1'>Sydney</SelectItem>
                      <SelectItem value='australia-southeast2'>Melbourne</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Other</SelectLabel>
                      <SelectItem value='southamerica-east1'>São Paulo</SelectItem>
                      <SelectItem value='southamerica-west1'>Santiago</SelectItem>
                      <SelectItem value='me-central1'>Doha</SelectItem>
                      <SelectItem value='me-central2'>Dammam</SelectItem>
                      <SelectItem value='me-west1'>Tel Aviv</SelectItem>
                      <SelectItem value='africa-south1'>Johannesburg</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
