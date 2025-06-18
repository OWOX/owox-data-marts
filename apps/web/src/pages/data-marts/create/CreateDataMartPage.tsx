import { useNavigate } from 'react-router-dom';
import { DataMartForm, DataMartProvider } from '../../../features/data-marts/edit';
import { DataStorageType } from '../../../features/data-storage';

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
        <DataMartProvider>
          <DataMartForm
            initialData={{
              title: '',
              storage: DataStorageType.GOOGLE_BIGQUERY,
            }}
            onSuccess={handleSuccess}
          />
        </DataMartProvider>
      </div>
    </main>
  );
}
