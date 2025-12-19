import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AthenaApiAdapterFactory } from './athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from './athena/adapters/s3-api-adapter.factory';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { AthenaDataMartSchemaParser } from './athena/services/athena-data-mart-schema.parser';
import { AthenaDataMartSchemaProvider } from './athena/services/athena-data-mart-schema.provider';
import { AthenaDataMartValidator } from './athena/services/athena-datamart.validator';
import { AthenaQueryBuilder } from './athena/services/athena-query.builder';
import { AthenaReportReader } from './athena/services/athena-report-reader.service';
import { AthenaReportHeadersGenerator } from './athena/services/athena-report-headers-generator.service';
import { AthenaSchemaMerger } from './athena/services/athena-schema-merger';
import { AthenaSqlDryRunExecutor } from './athena/services/athena-sql-dry-run.executor';
import { AthenaSqlRunExecutor } from './athena/services/athena-sql-run.executor';
import { AthenaCreateViewExecutor } from './athena/services/athena-create-view.executor';
import { BigQueryApiAdapterFactory } from './bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { BigQueryDataMartSchemaProvider } from './bigquery/services/bigquery-data-mart-schema.provider';
import { BigQueryDataMartSchemaParser } from './bigquery/services/bigquery-data-mart-schema.parser';
import { BigQueryDataMartValidator } from './bigquery/services/bigquery-datamart.validator';
import { BigQueryQueryBuilder } from './bigquery/services/bigquery-query.builder';
import { BigQueryReportReader } from './bigquery/services/bigquery-report-reader.service';
import { BigQueryReportHeadersGenerator } from './bigquery/services/bigquery-report-headers-generator.service';
import { BigQuerySchemaMerger } from './bigquery/services/bigquery-schema-merger';
import { BigquerySqlDryRunExecutor } from './bigquery/services/bigquery-sql-dry-run.executor';
import { BigQuerySqlRunExecutor } from './bigquery/services/bigquery-sql-run.executor';
import { BigQueryCreateViewExecutor } from './bigquery/services/bigquery-create-view.executor';
import { SnowflakeApiAdapterFactory } from './snowflake/adapters/snowflake-api-adapter.factory';
import { SnowflakeAccessValidator } from './snowflake/services/snowflake-access.validator';
import { SnowflakeDataMartSchemaParser } from './snowflake/services/snowflake-data-mart-schema.parser';
import { SnowflakeDataMartSchemaProvider } from './snowflake/services/snowflake-data-mart-schema.provider';
import { SnowflakeDataMartValidator } from './snowflake/services/snowflake-datamart.validator';
import { SnowflakeQueryBuilder } from './snowflake/services/snowflake-query.builder';
import { SnowflakeReportReader } from './snowflake/services/snowflake-report-reader.service';
import { SnowflakeReportHeadersGenerator } from './snowflake/services/snowflake-report-headers-generator.service';
import { SnowflakeSchemaMerger } from './snowflake/services/snowflake-schema-merger';
import { SnowflakeSqlDryRunExecutor } from './snowflake/services/snowflake-sql-dry-run.executor';
import { SnowflakeSqlRunExecutor } from './snowflake/services/snowflake-sql-run.executor';
import { SnowflakeCreateViewExecutor } from './snowflake/services/snowflake-create-view.executor';
import { RedshiftApiAdapterFactory } from './redshift/adapters/redshift-api-adapter.factory';
import { RedshiftAccessValidator } from './redshift/services/redshift-access.validator';
import { RedshiftDataMartSchemaParser } from './redshift/services/redshift-data-mart-schema.parser';
import { RedshiftDataMartSchemaProvider } from './redshift/services/redshift-data-mart-schema.provider';
import { RedshiftDataMartValidator } from './redshift/services/redshift-datamart.validator';
import { RedshiftQueryBuilder } from './redshift/services/redshift-query.builder';
import { RedshiftReportReader } from './redshift/services/redshift-report-reader.service';
import { RedshiftReportHeadersGenerator } from './redshift/services/redshift-report-headers-generator.service';
import { RedshiftSchemaMerger } from './redshift/services/redshift-schema-merger';
import { RedshiftSqlDryRunExecutor } from './redshift/services/redshift-sql-dry-run.executor';
import { RedshiftSqlRunExecutor } from './redshift/services/redshift-sql-run.executor';
import { RedshiftCreateViewExecutor } from './redshift/services/redshift-create-view.executor';
import { DataStorageType } from './enums/data-storage-type.enum';
import { DataMartSchemaMerger } from './interfaces/data-mart-schema-merger.interface';
import { DataMartSchemaParser } from './interfaces/data-mart-schema-parser.interface';
import { DataMartSchemaProvider } from './interfaces/data-mart-schema-provider.interface';
import { DataMartValidator } from './interfaces/data-mart-validator.interface';
import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { DataStorageReportReader } from './interfaces/data-storage-report-reader.interface';
import { ReportHeadersGenerator } from './interfaces/report-headers-generator.interface';
import { SqlDryRunExecutor } from './interfaces/sql-dry-run-executor.interface';
import { SqlRunExecutor } from './interfaces/sql-run-executor.interface';
import { CreateViewExecutor } from './interfaces/create-view-executor.interface';
import { DataStoragePublicCredentialsFactory } from './factories/data-storage-public-credentials.factory';
import { DataStorageCredentialsUtils } from './data-mart-schema.utils';

export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_STORAGE_REPORT_READER_RESOLVER = Symbol('DATA_STORAGE_REPORT_READER_RESOLVER');
export const DATA_MART_VALIDATOR_RESOLVER = Symbol('DATA_MART_VALIDATOR_RESOLVER');
export const DATA_MART_SCHEMA_PROVIDER_RESOLVER = Symbol('DATA_MART_SCHEMA_PROVIDER_RESOLVER');
export const DATA_MART_SCHEMA_MERGER_RESOLVER = Symbol('DATA_MART_SCHEMA_MERGER_RESOLVER');
export const DATA_MART_SCHEMA_PARSER_RESOLVER = Symbol('DATA_MART_SCHEMA_PARSER_RESOLVER');
export const REPORT_HEADERS_GENERATOR_RESOLVER = Symbol('REPORT_HEADERS_GENERATOR_RESOLVER');
export const SQL_DRY_RUN_EXECUTOR_RESOLVER = Symbol('SQL_DRY_RUN_EXECUTOR_RESOLVER');
export const SQL_RUN_EXECUTOR_RESOLVER = Symbol('SQL_RUN_EXECUTOR_RESOLVER');
export const CREATE_VIEW_EXECUTOR_RESOLVER = Symbol('CREATE_VIEW_EXECUTOR_RESOLVER');

const accessValidatorProviders = [
  BigQueryAccessValidator,
  AthenaAccessValidator,
  SnowflakeAccessValidator,
  RedshiftAccessValidator,
];
const storageDataProviders = [
  BigQueryReportReader,
  AthenaReportReader,
  SnowflakeReportReader,
  RedshiftReportReader,
];
const adapterFactories = [
  BigQueryApiAdapterFactory,
  AthenaApiAdapterFactory,
  S3ApiAdapterFactory,
  SnowflakeApiAdapterFactory,
  RedshiftApiAdapterFactory,
];
const queryBuilderProviders = [
  AthenaQueryBuilder,
  BigQueryQueryBuilder,
  SnowflakeQueryBuilder,
  RedshiftQueryBuilder,
];
const validatorProviders = [
  BigQueryDataMartValidator,
  AthenaDataMartValidator,
  SnowflakeDataMartValidator,
  RedshiftDataMartValidator,
];
const dataMartSchemaProviders = [
  BigQueryDataMartSchemaProvider,
  AthenaDataMartSchemaProvider,
  SnowflakeDataMartSchemaProvider,
  RedshiftDataMartSchemaProvider,
];
const dataMartSchemaMergerProviders = [
  BigQuerySchemaMerger,
  AthenaSchemaMerger,
  SnowflakeSchemaMerger,
  RedshiftSchemaMerger,
];
const schemaParserProviders = [
  BigQueryDataMartSchemaParser,
  AthenaDataMartSchemaParser,
  SnowflakeDataMartSchemaParser,
  RedshiftDataMartSchemaParser,
];
const reportHeadersGeneratorProviders = [
  BigQueryReportHeadersGenerator,
  AthenaReportHeadersGenerator,
  SnowflakeReportHeadersGenerator,
  RedshiftReportHeadersGenerator,
];
const sqlDryRunExecutorProviders = [
  BigquerySqlDryRunExecutor,
  AthenaSqlDryRunExecutor,
  SnowflakeSqlDryRunExecutor,
  RedshiftSqlDryRunExecutor,
];
const sqlRunExecutorProviders = [
  BigQuerySqlRunExecutor,
  AthenaSqlRunExecutor,
  SnowflakeSqlRunExecutor,
  RedshiftSqlRunExecutor,
];
const createViewExecutorProviders = [
  BigQueryCreateViewExecutor,
  AthenaCreateViewExecutor,
  SnowflakeCreateViewExecutor,
  RedshiftCreateViewExecutor,
];
const publicCredentialsProviders = [
  DataStoragePublicCredentialsFactory,
  DataStorageCredentialsUtils,
];

export const dataStorageResolverProviders = [
  ...accessValidatorProviders,
  ...storageDataProviders,
  ...adapterFactories,
  ...queryBuilderProviders,
  ...validatorProviders,
  ...dataMartSchemaProviders,
  ...dataMartSchemaMergerProviders,
  ...schemaParserProviders,
  ...reportHeadersGeneratorProviders,
  ...sqlDryRunExecutorProviders,
  ...sqlRunExecutorProviders,
  ...createViewExecutorProviders,
  ...publicCredentialsProviders,
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
    provide: REPORT_HEADERS_GENERATOR_RESOLVER,
    useFactory: (...generators: ReportHeadersGenerator[]) =>
      new TypeResolver<DataStorageType, ReportHeadersGenerator>(generators),
    inject: reportHeadersGeneratorProviders,
  },
  {
    provide: SQL_DRY_RUN_EXECUTOR_RESOLVER,
    useFactory: (...executors: SqlDryRunExecutor[]) =>
      new TypeResolver<DataStorageType, SqlDryRunExecutor>(executors),
    inject: sqlDryRunExecutorProviders,
  },
  {
    provide: SQL_RUN_EXECUTOR_RESOLVER,
    useFactory: (...executors: SqlRunExecutor[]) =>
      new TypeResolver<DataStorageType, SqlRunExecutor>(executors),
    inject: sqlRunExecutorProviders,
  },
  {
    provide: CREATE_VIEW_EXECUTOR_RESOLVER,
    useFactory: (...executors: CreateViewExecutor[]) =>
      new TypeResolver<DataStorageType, CreateViewExecutor>(executors),
    inject: createViewExecutorProviders,
  },
];
