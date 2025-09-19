import { DataMartCreateForm, DataMartProvider } from '../../../features/data-marts/edit';
import { DataStorageProvider } from '../../../features/data-storage/shared/model/context';
import { useProjectRoute } from '../../../shared/hooks';

export default function CreateDataMartPage() {
  const { navigate } = useProjectRoute();

  const handleSuccess = (response: { id: string }) => {
    navigate(`/data-marts/${response.id}/data-setup`);
  };

  return (
    <div className='flex h-full w-full items-center justify-center'>
      <div className='mx-auto my-auto w-lg'>
        <div className='bg-muted/50 dark:bg-sidebar rounded-xl border-b border-gray-200 p-12 pt-8 dark:border-gray-700/50'>
          <h2 className='mb-4 text-xl font-medium'>Create Data Mart</h2>
          <DataStorageProvider>
            <DataMartProvider>
              <DataMartCreateForm
                initialData={{
                  title: 'New Data Mart',
                }}
                onSuccess={handleSuccess}
              />
            </DataMartProvider>
          </DataStorageProvider>
        </div>
      </div>
    </div>
  );
}
