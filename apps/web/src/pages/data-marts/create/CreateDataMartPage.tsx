import { useNavigate } from 'react-router-dom';
import { DataMartCreateForm, DataMartProvider } from '../../../features/data-marts/edit';
import { DataStorageProvider } from '../../../features/data-storage/shared/model/context';

export default function CreateDataMartPage() {
  const navigate = useNavigate();

  const handleSuccess = (response: { id: string }) => {
    void navigate(`/data-marts/${response.id}/data-setup`);
  };

  return (
    <main className='container mx-auto px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Create Data Mart</h1>
      </div>

      <div className='rounded-lg p-6 shadow'>
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
    </main>
  );
}
