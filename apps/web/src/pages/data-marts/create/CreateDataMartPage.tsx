import { useNavigate } from 'react-router-dom';
import { DataMartCreateForm, DataMartProvider } from '../../../features/data-marts/edit';
import { DataStorageProvider } from '../../../features/data-storage/shared/model/context';

export default function CreateDataMartPage() {
  const navigate = useNavigate();

  const handleSuccess = (response: { id: string }) => {
    void navigate(`/data-marts/${response.id}/data-setup`);
  };

  return (
    <div className='flex h-full w-full items-center justify-center'>
      <div className='mx-auto my-auto w-lg'>
        <div className='dm-card !rounded-xl !p-8'>
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
