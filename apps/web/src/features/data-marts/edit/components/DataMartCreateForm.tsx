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
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Combobox } from '../../../../shared/components/Combobox/combobox';
import { DataStorageHealthIndicator, DataStorageType } from '../../../data-storage';
import { DataStorageTypeDialog } from '../../../data-storage/shared/components/DataStorageTypeDialog';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';
import { type DataMart, type DataMartFormData, dataMartSchema, useDataMartForm } from '../model';

interface DataMartFormProps {
  initialData?: {
    title: string;
  };
  onSuccess?: (response: Pick<DataMart, 'id' | 'title'>) => void;
}

const CREATE_NEW_STORAGE_VALUE = 'create_new';

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
  const hasAppliedSingleStorageAutoSelectRef = useRef(false);

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

  useEffect(() => {
    if (loadingStorages) return;
    if (dataStorages.length !== 1) return;
    if (hasAppliedSingleStorageAutoSelectRef.current) return;
    if (form.getValues('storageId')) return;

    const id = dataStorages[0].id;
    if (!id) return;

    hasAppliedSingleStorageAutoSelectRef.current = true;
    form.setValue('storageId', id, { shouldValidate: true, shouldDirty: false });
  }, [dataStorages, loadingStorages, form]);

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

  const storageOptions = useMemo(() => {
    const sortedMappedStorages = [...dataStorages]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(storage => ({
        value: storage.id,
        label: storage.title,
      }));

    return [
      ...sortedMappedStorages,
      {
        value: CREATE_NEW_STORAGE_VALUE,
        label: 'Create new storage',
        separator: true,
      },
    ];
  }, [dataStorages]);
  return (
    <>
      <Form {...form}>
        <AppForm
          data-testid='datamartCreateForm'
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
                        if (value === CREATE_NEW_STORAGE_VALUE) {
                          selectDataStorageType();
                        } else {
                          field.onChange(value);
                        }
                      }}
                      placeholder={loadingStorages ? 'Loading...' : 'Select a storage'}
                      emptyMessage='No storages found'
                      disabled={isSubmitting || loadingStorages}
                      className='w-full'
                      renderLabel={option =>
                        option.value === CREATE_NEW_STORAGE_VALUE ? (
                          <div className='flex min-w-0 flex-1 items-center gap-2'>
                            <div className='flex h-6 w-6 items-center justify-center'>
                              <Plus size={16} />
                            </div>
                            <span className='min-w-0 truncate'>{option.label}</span>
                          </div>
                        ) : (
                          <div className='flex min-w-0 flex-1 items-center gap-2'>
                            <div className='shrink-0'>
                              <DataStorageHealthIndicator
                                storageId={option.value}
                                storageTitle={option.label}
                                hovercardSide='left'
                                variant='compact'
                              />
                            </div>
                            <span className='min-w-0 truncate'>{option.label}</span>
                          </div>
                        )
                      }
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
