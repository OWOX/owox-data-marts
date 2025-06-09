import { DataMartList, DataMartListProvider } from '../features/data-mart-list';

export default function DataMartsPage() {
  return (
    <main className='container mx-auto px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>Data Marts</h1>
      <DataMartListProvider>
        <DataMartList />
      </DataMartListProvider>
    </main>
  );
}
