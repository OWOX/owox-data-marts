import { type DataMart, useDataMartForm, dataMartSchema, type DataMartFormData } from '../model';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import { Button } from '@owox/ui/components/button';
import { useEffect } from 'react';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';

interface DataMartFormProps {
  initialData?: {
    title: string;
  };
  onSuccess?: (response: Pick<DataMart, 'id' | 'title'>) => void;
}

export function DataMartForm({ initialData, onSuccess }: DataMartFormProps) {
  const { handleCreate, isSubmitting, serverError } = useDataMartForm();
  const { dataStorages, loading: loadingStorages, fetchDataStorages } = useDataStorage();

  useEffect(() => {
    void fetchDataStorages();
  }, [fetchDataStorages]);

  const form = useForm<DataMartFormData>({
    resolver: zodResolver(dataMartSchema),
    defaultValues: {
      title: initialData?.title ?? '',
      storageId: '',
    },
  });

  const { formState } = form;
  const { errors } = formState;

  const onSubmit = async (data: DataMartFormData) => {
    const response = await handleCreate(data);
    if (response && onSuccess) {
      onSuccess(response);
    }
  };

  return (
    <form
      onSubmit={e => {
        void form.handleSubmit(onSubmit)(e);
      }}
      className='space-y-4'
    >
      {serverError && <div className='rounded bg-red-100 p-3 text-red-700'>{serverError}</div>}

      <div>
        <Label htmlFor='title' className='mb-1 block text-sm font-medium'>
          Title
        </Label>
        <Input id='title' {...form.register('title')} className='w-full' disabled={isSubmitting} />
        {errors.title && <p className='mt-1 text-sm text-red-600'>{errors.title.message}</p>}
      </div>

      <div>
        <Label htmlFor='storageId' className='mb-1 block text-sm font-medium'>
          Data Storage
        </Label>
        <Select
          onValueChange={value => {
            form.setValue('storageId', value, { shouldValidate: true });
          }}
          value={form.watch('storageId')}
          disabled={isSubmitting || loadingStorages}
        >
          <SelectTrigger className={'w-full'}>
            <SelectValue placeholder='Select a data storage' />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {loadingStorages && (
                <SelectItem value='loading' disabled>
                  Loading...
                </SelectItem>
              )}
              {!loadingStorages && dataStorages.length === 0 && (
                <SelectItem value='empty' disabled>
                  No data storages available
                </SelectItem>
              )}
              {!loadingStorages &&
                dataStorages.map(storage => (
                  <SelectItem key={storage.id} value={storage.id}>
                    {storage.title}
                  </SelectItem>
                ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {errors.storageId && (
          <p className='mt-1 text-sm text-red-600'>{errors.storageId.message}</p>
        )}
      </div>

      <div className='pt-2'>
        <Button type='submit' disabled={isSubmitting} variant={'secondary'}>
          {isSubmitting ? 'Saving...' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
