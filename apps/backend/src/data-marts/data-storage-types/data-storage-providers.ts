import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { DataStorageType } from './enums/data-storage-type.enum';
import { TypeResolver } from '../../common/resolver/type-resolver';

export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);

const accessValidatorProviders = [BigQueryAccessValidator, AthenaAccessValidator];

export const dataStorageResolverProviders = [
  ...accessValidatorProviders,
  {
    provide: DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataStorageAccessValidator[]) =>
      new TypeResolver<DataStorageType, DataStorageAccessValidator>(validators),
    inject: accessValidatorProviders,
  },
];
