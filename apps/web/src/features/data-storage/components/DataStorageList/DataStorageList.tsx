import { useEffect } from 'react';
import { useDataStorage } from '../../model/hooks/useDataStorage';
import { DataStorageType } from '../../model/types/data-storage-type.enum';
import { Eye, Pencil, Trash2 } from 'lucide-react'; // Import the icons

export const DataStorageList = () => {
  const { dataStorages, loading, error, fetchDataStorages } = useDataStorage();

  useEffect(() => {
    void fetchDataStorages();
  }, [fetchDataStorages]);

  if (loading) {
    return <div className='py-4'>Loading data storages...</div>;
  }

  if (error) {
    return <div className='py-4 text-red-500'>Error: {error}</div>;
  }

  if (!dataStorages.length) {
    return <div className='py-4'>No data storages found.</div>;
  }

  return (
    <div className='mt-4'>
      <div className='overflow-x-auto rounded-lg border border-gray-200'>
        <table className='min-w-full divide-y divide-gray-200'>
          <thead className='bg-gray-50'>
            <tr>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
              >
                Title
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
              >
                Type
              </th>
              <th
                scope='col'
                className='px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase'
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className='divide-y divide-gray-200 bg-white'>
            {dataStorages.map(storage => (
              <tr key={storage.id}>
                <td className='px-6 py-4 whitespace-nowrap'>
                  <div className='text-sm font-medium text-gray-900'>{storage.title}</div>
                </td>
                <td className='px-6 py-4 whitespace-nowrap'>
                  <span className='inline-flex rounded-full bg-blue-100 px-2 text-xs leading-5 font-semibold text-blue-800'>
                    {storage.type === DataStorageType.GOOGLE_BIGQUERY
                      ? 'Google BigQuery'
                      : 'AWS Athena'}
                  </span>
                </td>
                <td className='px-6 py-4 whitespace-nowrap'>
                  <div className='flex gap-3'>
                    <button
                      onClick={() => {
                        console.log('View details', storage.id);
                      }}
                      className='text-blue-600 hover:text-blue-800'
                    >
                      <Eye size={20} />
                    </button>
                    <button
                      onClick={() => {
                        console.log('Edit', storage.id);
                      }}
                      className='text-gray-600 hover:text-gray-800'
                    >
                      <Pencil size={20} />
                    </button>
                    <button
                      onClick={() => {
                        console.log('Delete', storage.id);
                      }}
                      className='text-red-600 hover:text-red-800'
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
