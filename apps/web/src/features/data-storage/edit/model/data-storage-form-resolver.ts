import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { keepBoundCredential } from '../../../../utils/form-utils';
import {
  dataStorageSchema,
  newOwoxStorageFormSchema,
  owoxStorageFormSchema,
  type DataStorageFormData,
} from '../../shared';

export function createDataStorageFormResolver(
  hasBinding: boolean,
  owoxStorage?: 'saved' | 'new'
): Resolver<DataStorageFormData> {
  if (owoxStorage === 'new') {
    return zodResolver(newOwoxStorageFormSchema) as unknown as Resolver<DataStorageFormData>;
  }
  if (owoxStorage) return zodResolver(owoxStorageFormSchema) as Resolver<DataStorageFormData>;
  return keepBoundCredential(zodResolver(dataStorageSchema), hasBinding);
}
