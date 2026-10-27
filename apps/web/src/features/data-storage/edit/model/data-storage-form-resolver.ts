import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { keepBoundCredential } from '../../../../utils/form-utils';
import { dataStorageSchema, type DataStorageFormData } from '../../shared';

export function createDataStorageFormResolver(hasBinding: boolean): Resolver<DataStorageFormData> {
  return keepBoundCredential(zodResolver(dataStorageSchema), hasBinding);
}
