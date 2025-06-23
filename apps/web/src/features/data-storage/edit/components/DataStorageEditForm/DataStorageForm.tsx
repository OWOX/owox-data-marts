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
import {
  type DataStorageFormData,
  dataStorageSchema,
} from '../../../shared/types/data-storage.schema.ts';
import { Label } from '@owox/ui/components/label';

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

  const { watch } = form;
  const selectedType = watch('type');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        void form.handleSubmit(onSubmit)(e);
      }}
      className='space-y-6'
    >
      <div className='space-y-4'>
        <div>
          <Label className='block text-sm font-medium text-gray-700'>Storage Provider</Label>

          <Select
            defaultValue={initialData?.type}
            onValueChange={value => {
              form.setValue('type', value as DataStorageType);
            }}
            disabled={!!initialData}
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select a data storage type' />
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
        <Button variant={'secondary'} type='submit'>
          Save
        </Button>
      </div>
    </form>
  );
}
