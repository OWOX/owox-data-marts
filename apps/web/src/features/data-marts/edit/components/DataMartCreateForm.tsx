import {
  Form,
  AppForm,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormLayout,
  FormActions,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { useEffect } from 'react';
import { type DataMart, useDataMartForm, dataMartSchema, type DataMartFormData } from '../model';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model.ts';
import { Button } from '@owox/ui/components/button';

interface DataMartFormProps {
  initialData?: {
    title: string;
  };
  onSuccess?: (response: Pick<DataMart, 'id' | 'title'>) => void;
}

export function DataMartCreateForm({ initialData, onSuccess }: DataMartFormProps) {
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
    mode: 'onTouched',
  });

  const onSubmit = async (data: DataMartFormData) => {
    const response = await handleCreate(data);
    if (response && onSuccess) {
      onSuccess(response);
    }
  };

  return (
    <Form {...form}>
      <AppForm
        onSubmit={e => {
          void form.handleSubmit(onSubmit)(e);
        }}
      >
        <FormLayout variant='light'>
          {serverError && (
            <div className='rounded bg-red-100 p-3 text-red-700'>{serverError.message}</div>
          )}

          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input id='title' placeholder='Enter title' {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='storageId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Storage</FormLabel>
                <FormControl>
                  <Select
                    onValueChange={value => {
                      field.onChange(value);
                    }}
                    value={field.value}
                    disabled={isSubmitting || loadingStorages}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Select a storage' />
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
                            No storages available
                          </SelectItem>
                        )}
                        {!loadingStorages &&
                          dataStorages.map(storage => {
                            const Icon = DataStorageTypeModel.getInfo(storage.type).icon;
                            return (
                              <SelectItem key={storage.id} value={storage.id}>
                                <div className='flex items-center gap-2'>
                                  <Icon size={20} />
                                  <span>{storage.title}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormLayout>
        <FormActions variant='light'>
          <Button type='submit'>Create Data Mart</Button>
          <Button
            variant='outline'
            type='button'
            onClick={() => {
              window.history.back();
            }}
          >
            Go back
          </Button>
        </FormActions>
      </AppForm>
    </Form>
  );
}
