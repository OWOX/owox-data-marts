import { DataStorageProvider } from '../../features/data-storage/model/context';
import { DataStorageList } from '../../features/data-storage/components';

export const DataStoragePage = () => {
  return (
    <main className='container mx-auto px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>Data Storages</h1>
      <DataStorageProvider>
        <DataStorageList />
      </DataStorageProvider>
    </main>
  );
};
