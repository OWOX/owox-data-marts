import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@owox/ui/components/button';
import {
  AppForm,
  Form,
  FormActions,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormLayout,
  FormMessage,
} from '@owox/ui/components/form';
import { Input } from '@owox/ui/components/input';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { DataStorageType } from '../../../data-storage';
import { DataStorageTypeDialog } from '../../../data-storage/shared/components/DataStorageTypeDialog';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';
import { type DataMart, type DataMartFormData, dataMartSchema, useDataMartForm } from '../model';

interface DataMartFormProps {
  initialData?: {
    title: string;
  };
  onSuccess?: (response: Pick<DataMart, 'id' | 'title'>) => void;
}

export function DataMartCreateForm({ initialData, onSuccess }: DataMartFormProps) {
  const { handleCreate, isSubmitting, serverError } = useDataMartForm();
  const {
    dataStorages,
    loading: loadingStorages,
    fetchDataStorages,
    createDataStorage,
    getDataStorageById,
  } = useDataStorage();
  const [isDataStorageTypeDialogOpen, setIsDataStorageTypeDialogOpen] = useState(false);
  const [isCreatingDataStorage, setIsCreatingDataStorage] = useState(false);

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

  const selectDataStorageType = () => {
    setIsDataStorageTypeDialogOpen(true);
  };

  const createNewDataStorage = async (type: DataStorageType) => {
    setIsCreatingDataStorage(true);
    try {
      const newStorage = await createDataStorage(type);
      if (newStorage?.id) {
        await getDataStorageById(newStorage.id);
        form.setValue('storageId', newStorage.id);
      }
    } catch (error) {
      console.error('Failed to create storage:', error);
    }
    setIsDataStorageTypeDialogOpen(false);
    setIsCreatingDataStorage(false);
  };
  const storageOptions = [
    ...[...dataStorages]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(storage => ({
        value: storage.id,
        label: storage.title,
      })),
    { value: 'create_new', label: '+ Create new storage' },
  ];
  return (
    <>
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
                    <Input
                      id='title'
                      placeholder='Enter title'
                      {...field}
                      disabled={isSubmitting}
                    />
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
                    <Combobox
                      options={storageOptions}
                      value={field.value}
                      onValueChange={value => {
                        if (value === 'create_new') {
                          selectDataStorageType();
                        } else {
                          field.onChange(value);
                        }
                      }}
                      placeholder={loadingStorages ? 'Loading...' : 'Select a storage'}
                      emptyMessage='No storages found'
                      disabled={isSubmitting || loadingStorages}
                    />
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

      <DataStorageTypeDialog
        isOpen={isDataStorageTypeDialogOpen}
        onClose={() => {
          setIsDataStorageTypeDialogOpen(false);
        }}
        onSelect={type => createNewDataStorage(type)}
        isCreatingDataStorage={isCreatingDataStorage}
      />
    </>
  );
}
