import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DataStorageType } from '../../../shared';
import { Button } from '@owox/ui/components/button';
import { GoogleBigQueryFields } from './GoogleBigQueryFields';
import { AwsAthenaFields } from './AwsAthenaFields';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { DataStorageTypeModel } from '../../../shared/types/data-storage-type.model.ts';
import { type DataStorageFormData, dataStorageSchema } from '../../../shared';
import { Label } from '@owox/ui/components/label';
import { Input } from '@owox/ui/components/input';

interface DataStorageFormProps {
  initialData?: DataStorageFormData;
  onSubmit: (data: DataStorageFormData) => Promise<void>;
  onCancel: () => void;
}

export function DataStorageForm({ initialData, onSubmit, onCancel }: DataStorageFormProps) {
  const form = useForm<DataStorageFormData>({
    resolver: zodResolver(dataStorageSchema),
    defaultValues: initialData,
  });

  const {
    watch,
    register,
    formState: { errors },
  } = form;
  const selectedType = watch('type');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        void form.handleSubmit(onSubmit)(e);
      }}
      className='space-y-4'
    >
      <div className='space-y-4'>
        <div>
          <Label htmlFor='title' className='block text-sm font-medium text-gray-700'>
            Title<span className='ml-1 text-red-500'>*</span>
          </Label>
          <Input
            id='title'
            type='text'
            {...register('title')}
            className='mt-1 block w-full'
            aria-required='true'
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className='mt-1 text-sm text-red-600'>{errors.title.message}</p>}
        </div>

        <div>
          <Label className='block text-sm font-medium text-gray-700'>Storage Provider</Label>

          <Select
            defaultValue={initialData?.type}
            onValueChange={value => {
              form.setValue(
                'type',
                value as DataStorageType.GOOGLE_BIGQUERY | DataStorageType.AWS_ATHENA
              );
            }}
            disabled={!!initialData}
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select a storage type' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DataStorageTypeModel.getAllTypes().map(({ type, displayName, icon: Icon }) => (
                  <SelectItem key={type} value={type}>
                    <div className='flex items-center gap-2'>
                      <Icon />
                      {displayName}
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {selectedType === DataStorageType.GOOGLE_BIGQUERY && <GoogleBigQueryFields form={form} />}
        {selectedType === DataStorageType.AWS_ATHENA && <AwsAthenaFields form={form} />}
      </div>

      <div className='flex justify-end space-x-4'>
        <Button variant={'ghost'} type='button' onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={'default'} type='submit'>
          Save
        </Button>
      </div>
    </form>
  );
}
