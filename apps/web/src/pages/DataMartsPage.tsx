import { DataMartList, DataMartListProvider } from '../features/data-mart-list';

export default function DataMartsPage() {
  return (
    <div>
      <header className='border-b px-12 py-4'>
        <h1 className='text-xl font-medium'>Data Marts</h1>
      </header>
      <div className='p-4 sm:px-12 sm:py-4'>
        <DataMartListProvider>
          <DataMartList />
        </DataMartListProvider>
      </div>
    </div>
  );
}
