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
  SelectSeparator,
} from '@owox/ui/components/select';
import { useEffect, useState } from 'react';
import { type DataMart, useDataMartForm, dataMartSchema, type DataMartFormData } from '../model';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useDataStorage } from '../../../data-storage/shared/model/hooks/useDataStorage';
import { DataStorageTypeModel } from '../../../data-storage/shared/types/data-storage-type.model.ts';
import { Button } from '@owox/ui/components/button';
import { DataStorageTypeDialog } from '../../../data-storage/shared/components/DataStorageTypeDialog';
import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';
import { Plus } from 'lucide-react';

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
  };

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
                    <Select
                      onValueChange={value => {
                        if (value === 'create_new') {
                          selectDataStorageType();
                        } else {
                          field.onChange(value);
                        }
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
                          {!loadingStorages && dataStorages.length > 0 && <SelectSeparator />}
                          <SelectItem value='create_new'>
                            <div className='flex items-center gap-2'>
                              <div className='flex h-5 w-5 items-center justify-center'>
                                <Plus size={20} />
                              </div>
                              <span>Create new storage</span>
                            </div>
                          </SelectItem>
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

      <DataStorageTypeDialog
        isOpen={isDataStorageTypeDialogOpen}
        onClose={() => {
          setIsDataStorageTypeDialogOpen(false);
        }}
        onSelect={type => createNewDataStorage(type)}
      />
    </>
  );
}
