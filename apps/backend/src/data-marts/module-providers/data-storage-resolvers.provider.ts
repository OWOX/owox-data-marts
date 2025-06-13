import {
  BigQueryTitleGenerator,
  AthenaTitleGenerator,
  DataStorageTitleGenerator,
} from '../services/data-storage-title.generator';
import {
  BigQueryAccessValidator,
  AthenaAccessValidator,
  DataStorageAccessValidator,
} from '../services/data-storage-access.validator';
import { DataStorageType } from '../enums/data-storage-type.enum';
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
