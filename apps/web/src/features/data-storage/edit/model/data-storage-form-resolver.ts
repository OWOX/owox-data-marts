import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { dataStorageSchema, type DataStorageFormData } from '../../shared';

// With a binding, an empty field keeps it: a Credential the member cannot see has no id here.
export function createDataStorageFormResolver(hasBinding: boolean): Resolver<DataStorageFormData> {
  const baseResolver = zodResolver(dataStorageSchema);
  return async (values, context, options) => {
    if (!hasBinding || values.reusableCredentialId) {
      return baseResolver(values, context, options);
    }
    const result = await baseResolver(
      { ...values, reusableCredentialId: 'kept' },
      context,
      options
    );
    if (Object.keys(result.errors).length > 0) return result;
    const { reusableCredentialId: _kept, ...rest } = result.values as DataStorageFormData;
    void _kept;
    return { values: rest as DataStorageFormData, errors: {} };
  };
}
