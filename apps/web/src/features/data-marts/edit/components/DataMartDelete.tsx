import { useState } from 'react';
import { useDataMartContext } from '../model';

interface DataMartDeleteProps {
  id: string;
  title: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function DataMartDelete({ id, title, onSuccess, onCancel }: DataMartDeleteProps) {
  const { deleteDataMart } = useDataMartContext();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await deleteDataMart(id);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete data mart');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <h2 className='mb-4 text-xl font-bold text-gray-900'>Delete Data Mart</h2>

      <p className='mb-4 text-gray-700'>
        Are you sure you want to delete <strong>"{title}"</strong>? This action cannot be undone.
      </p>

      {error && <div className='mb-4 rounded bg-red-100 p-3 text-red-700'>{error}</div>}

      <div className='flex justify-end space-x-3'>
        <button
          type='button'
          onClick={onCancel}
          disabled={isDeleting}
          className='rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none'
        >
          Cancel
        </button>

        <button
          type='button'
          onClick={() => void handleDelete()}
          disabled={isDeleting}
          className='rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50'
        >
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
