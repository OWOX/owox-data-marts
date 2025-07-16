import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AthenaApiAdapterFactory } from './athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from './athena/adapters/s3-api-adapter.factory';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { AthenaDataMartSchemaProvider } from './athena/services/athena-data-mart-schema.provider';
import { AthenaDataMartSchemaParser } from './athena/services/athena-data-mart-schema.parser';
import { AthenaDataMartValidator } from './athena/services/athena-datamart.validator';
import { AthenaQueryBuilder } from './athena/services/athena-query.builder';
import { AthenaReportReader } from './athena/services/athena-report-reader.service';
import { AthenaSchemaMerger } from './athena/services/athena-schema-merger';
import { AthenaSqlDryRunExecutor } from './athena/services/athena-sql-dry-run.executor';
import { BigQueryApiAdapterFactory } from './bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { BigQueryDataMartSchemaProvider } from './bigquery/services/bigquery-data-mart-schema.provider';
import { BigQueryDataMartSchemaParser } from './bigquery/services/bigquery-data-mart-schema.parser';
import { BigQueryDataMartValidator } from './bigquery/services/bigquery-datamart.validator';
import { BigQueryQueryBuilder } from './bigquery/services/bigquery-query.builder';
import { BigQueryReportFormatterService } from './bigquery/services/bigquery-report-formatter.service';
import { BigQueryReportReader } from './bigquery/services/bigquery-report-reader.service';
import { BigQuerySchemaMerger } from './bigquery/services/bigquery-schema-merger';
import { BigquerySqlDryRunExecutor } from './bigquery/services/bigquery-sql-dry-run.executor';
import { DataStorageType } from './enums/data-storage-type.enum';
import { DataMartSchemaMerger } from './interfaces/data-mart-schema-merger.interface';
import { DataMartSchemaParser } from './interfaces/data-mart-schema-parser.interface';
import { DataMartSchemaProvider } from './interfaces/data-mart-schema-provider.interface';
import { DataMartValidator } from './interfaces/data-mart-validator.interface';
import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { DataStorageReportReader } from './interfaces/data-storage-report-reader.interface';
import { SqlDryRunExecutor } from './interfaces/sql-dry-run-executor.interface';

export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_STORAGE_REPORT_READER_RESOLVER = Symbol('DATA_STORAGE_REPORT_READER_RESOLVER');
export const DATA_MART_VALIDATOR_RESOLVER = Symbol('DATA_MART_VALIDATOR_RESOLVER');
export const DATA_MART_SCHEMA_PROVIDER_RESOLVER = Symbol('DATA_MART_SCHEMA_PROVIDER_RESOLVER');
export const DATA_MART_SCHEMA_MERGER_RESOLVER = Symbol('DATA_MART_SCHEMA_MERGER_RESOLVER');
export const DATA_MART_SCHEMA_PARSER_RESOLVER = Symbol('DATA_MART_SCHEMA_PARSER_RESOLVER');
export const SQL_DRY_RUN_EXECUTOR_RESOLVER = Symbol('SQL_DRY_RUN_EXECUTOR_RESOLVER');

const accessValidatorProviders = [BigQueryAccessValidator, AthenaAccessValidator];
const storageDataProviders = [BigQueryReportReader, AthenaReportReader];
const adapterFactories = [BigQueryApiAdapterFactory, AthenaApiAdapterFactory, S3ApiAdapterFactory];
const queryBuilderProviders = [AthenaQueryBuilder, BigQueryQueryBuilder];
const validatorProviders = [BigQueryDataMartValidator, AthenaDataMartValidator];
const dataMartSchemaProviders = [BigQueryDataMartSchemaProvider, AthenaDataMartSchemaProvider];
const dataMartSchemaMergerProviders = [BigQuerySchemaMerger, AthenaSchemaMerger];
const schemaParserProviders = [BigQueryDataMartSchemaParser, AthenaDataMartSchemaParser];
const sqlDryRunExecutorProviders = [BigquerySqlDryRunExecutor, AthenaSqlDryRunExecutor];

export const dataStorageResolverProviders = [
  ...accessValidatorProviders,
  ...storageDataProviders,
  ...adapterFactories,
  ...queryBuilderProviders,
  ...validatorProviders,
  ...dataMartSchemaProviders,
  ...dataMartSchemaMergerProviders,
  ...schemaParserProviders,
  ...sqlDryRunExecutorProviders,
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
  {
    provide: DATA_MART_SCHEMA_PROVIDER_RESOLVER,
    useFactory: (...providers: DataMartSchemaProvider[]) =>
      new TypeResolver<DataStorageType, DataMartSchemaProvider>(providers),
    inject: dataMartSchemaProviders,
  },
  {
    provide: DATA_MART_SCHEMA_MERGER_RESOLVER,
    useFactory: (...mergers: DataMartSchemaMerger[]) =>
      new TypeResolver<DataStorageType, DataMartSchemaMerger>(mergers),
    inject: dataMartSchemaMergerProviders,
  },
  {
    provide: DATA_MART_SCHEMA_PARSER_RESOLVER,
    useFactory: (...parsers: DataMartSchemaParser[]) =>
      new TypeResolver<DataStorageType, DataMartSchemaParser>(parsers),
    inject: schemaParserProviders,
  },
  {
    provide: SQL_DRY_RUN_EXECUTOR_RESOLVER,
    useFactory: (...executors: SqlDryRunExecutor[]) =>
      new TypeResolver<DataStorageType, SqlDryRunExecutor>(executors),
    inject: sqlDryRunExecutorProviders,
  },
];
