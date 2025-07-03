import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { DataStorageType } from './enums/data-storage-type.enum';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { BigQueryReportReader } from './bigquery/services/bigquery-report-reader.service';
import { DataStorageReportReader } from './interfaces/data-storage-report-reader.interface';
import { AthenaReportReader } from './athena/services/athena-report-reader.service';
import { BigQueryApiAdapterFactory } from './bigquery/adapters/bigquery-api-adapter.factory';
import { AthenaApiAdapterFactory } from './athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from './athena/adapters/s3-api-adapter.factory';
import { BigQueryReportFormatterService } from './bigquery/services/bigquery-report-formatter.service';
import { ModuleRef } from '@nestjs/core';
import { AthenaQueryBuilder } from './athena/services/athena-query.builder';
import { BigQueryQueryBuilder } from './bigquery/services/bigquery-query.builder';
import { DataMartValidator } from './interfaces/data-mart-validator.interface';
import { BigQueryDataMartValidator } from './bigquery/services/bigquery-datamart.validator';
import { AthenaDataMartValidator } from './athena/services/athena-datamart.validator';

export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_STORAGE_REPORT_READER_RESOLVER = Symbol('DATA_STORAGE_REPORT_READER_RESOLVER');
export const DATA_MART_VALIDATOR_RESOLVER = Symbol('DATA_MART_VALIDATOR_RESOLVER');

const accessValidatorProviders = [BigQueryAccessValidator, AthenaAccessValidator];
const storageDataProviders = [BigQueryReportReader, AthenaReportReader];
const adapterFactories = [BigQueryApiAdapterFactory, AthenaApiAdapterFactory, S3ApiAdapterFactory];
const queryBuilderProviders = [AthenaQueryBuilder, BigQueryQueryBuilder];
const validatorProviders = [BigQueryDataMartValidator, AthenaDataMartValidator];

export const dataStorageResolverProviders = [
  ...accessValidatorProviders,
  ...storageDataProviders,
  ...adapterFactories,
  ...queryBuilderProviders,
  ...validatorProviders,
  BigQueryReportFormatterService,
  {
    provide: DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataStorageAccessValidator[]) =>
      new TypeResolver<DataStorageType, DataStorageAccessValidator>(validators),
    inject: accessValidatorProviders,
  },
  {
    provide: DATA_STORAGE_REPORT_READER_RESOLVER,
    useFactory: (moduleRef: ModuleRef, ...storageDataProviders: DataStorageReportReader[]) =>
      new TypeResolver<DataStorageType, DataStorageReportReader>(storageDataProviders, moduleRef),
    inject: [ModuleRef, ...storageDataProviders],
  },
  {
    provide: DATA_MART_VALIDATOR_RESOLVER,
    useFactory: (...validators: DataMartValidator[]) =>
      new TypeResolver<DataStorageType, DataMartValidator>(validators),
    inject: validatorProviders,
  },
];
