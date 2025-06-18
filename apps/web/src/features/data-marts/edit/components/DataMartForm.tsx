import React, { useState, useEffect } from 'react';
import { type DataMart, useDataMartForm } from '../model';
import { useDataMartContext } from '../model';
import { DataStorageType } from '../../../data-storage';

interface DataMartFormProps {
  initialData?: {
    id?: string;
    title: string;
    storage: DataStorageType;
  };
  onSuccess?: (response: Pick<DataMart, 'id' | 'title'>) => void;
}

export function DataMartForm({ initialData, onSuccess }: DataMartFormProps) {
  const { dataMart } = useDataMartContext();
  const { handleCreate, handleUpdate, errors, isSubmitting, serverError } = useDataMartForm();

  const [formData, setFormData] = useState({
    title: '',
    storage: DataStorageType.GOOGLE_BIGQUERY,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        storage: initialData.storage,
      });
    } else if (dataMart) {
      setFormData({
        title: dataMart.title,
        storage: dataMart.storageType,
      });
    }
  }, [initialData, dataMart]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (initialData?.id) {
      // Update existing data mart
      const success = await handleUpdate(initialData.id, formData);
      if (success && onSuccess) {
        //onSuccess(success);
      }
    } else {
      // Create new data mart
      const response = await handleCreate(formData);
      if (response) {
        if (onSuccess) {
          onSuccess(response);
        }
      }
    }
  };

  return (
    <form onSubmit={e => void handleSubmit(e)} className='space-y-4'>
      {serverError && <div className='rounded bg-red-100 p-3 text-red-700'>{serverError}</div>}

      <div>
        <label htmlFor='title' className='mb-1 block text-sm font-medium'>
          Title
        </label>
        <input
          id='title'
          name='title'
          type='text'
          value={formData.title}
          onChange={handleChange}
          className='w-full rounded border p-2 focus:ring-2 focus:ring-blue-500'
          disabled={isSubmitting}
        />
        {errors.title && <p className='mt-1 text-sm text-red-600'>{errors.title}</p>}
      </div>

      <div>
        <label htmlFor='storageType' className='mb-1 block text-sm font-medium'>
          Storage Type
        </label>
        <select
          id='storageType'
          name='storage'
          value={formData.storage}
          onChange={handleChange}
          className='w-full rounded border p-2 focus:ring-2 focus:ring-blue-500'
          disabled={isSubmitting}
        >
          <option value={DataStorageType.GOOGLE_BIGQUERY}>Google BigQuery</option>
          <option value={DataStorageType.AWS_ATHENA}>AWS Athena</option>
        </select>
        {errors.storageType && <p className='mt-1 text-sm text-red-600'>{errors.storageType}</p>}
      </div>

      <div className='pt-2'>
        <button
          type='submit'
          disabled={isSubmitting}
          className='rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50'
        >
          {isSubmitting ? 'Saving...' : initialData?.id ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
