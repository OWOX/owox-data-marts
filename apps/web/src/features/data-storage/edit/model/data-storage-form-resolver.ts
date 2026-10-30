import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { keepBoundCredential } from '../../../../utils/form-utils';
import { dataStorageSchema, owoxStorageFormSchema, type DataStorageFormData } from '../../shared';

export function createDataStorageFormResolver(
  hasBinding: boolean,
  isOwoxStorage = false
): Resolver<DataStorageFormData> {
  if (isOwoxStorage) return zodResolver(owoxStorageFormSchema) as Resolver<DataStorageFormData>;
  return keepBoundCredential(zodResolver(dataStorageSchema), hasBinding);
}
