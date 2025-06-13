import { DataStorageTitleGenerator } from './interfaces/data-storage-title-generator.interface';
import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { BigQueryTitleGenerator } from './bigquery/services/bigquery-title.generator';
import { AthenaTitleGenerator } from './athena/services/athena-title.generator';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { DataStorageType } from './enums/data-storage-type.enum';
import { TypeResolver } from '../../common/resolver/type-resolver';

export const DATA_STORAGE_TITLE_GENERATOR_RESOLVER = Symbol(
  'DATA_STORAGE_TITLE_GENERATOR_RESOLVER'
);
export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);

const titleGeneratorProviders = [BigQueryTitleGenerator, AthenaTitleGenerator];
const accessValidatorProviders = [BigQueryAccessValidator, AthenaAccessValidator];

export const dataStorageResolverProviders = [
  ...titleGeneratorProviders,
  ...accessValidatorProviders,
  {
    provide: DATA_STORAGE_TITLE_GENERATOR_RESOLVER,
    useFactory: (...titleGenerators: DataStorageTitleGenerator[]) =>
      new TypeResolver<DataStorageType, DataStorageTitleGenerator>(titleGenerators),
    inject: titleGeneratorProviders,
  },
  {
    provide: DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataStorageAccessValidator[]) =>
      new TypeResolver<DataStorageType, DataStorageAccessValidator>(validators),
    inject: accessValidatorProviders,
  },
];
