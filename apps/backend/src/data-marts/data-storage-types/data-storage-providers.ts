import { ModuleRef } from '@nestjs/core';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { AthenaApiAdapterFactory } from './athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from './athena/adapters/s3-api-adapter.factory';
import { AthenaAccessValidator } from './athena/services/athena-access.validator';
import { AthenaCreateViewExecutor } from './athena/services/athena-create-view.executor';
import { AthenaDataMartSchemaParser } from './athena/services/athena-data-mart-schema.parser';
import { AthenaDataMartSchemaProvider } from './athena/services/athena-data-mart-schema.provider';
import { AthenaDataMartValidator } from './athena/services/athena-datamart.validator';
import { AthenaQueryBuilder } from './athena/services/athena-query.builder';
import { AthenaReportHeadersGenerator } from './athena/services/athena-report-headers-generator.service';
import { AthenaReportReader } from './athena/services/athena-report-reader.service';
import { AthenaSchemaMerger } from './athena/services/athena-schema-merger';
import { AthenaSqlDryRunExecutor } from './athena/services/athena-sql-dry-run.executor';
import { AthenaSqlRunExecutor } from './athena/services/athena-sql-run.executor';
import { BigQueryApiAdapterFactory } from './bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryAccessValidator } from './bigquery/services/bigquery-access.validator';
import { BigQueryCreateViewExecutor } from './bigquery/services/bigquery-create-view.executor';
import { BigQueryDataMartSchemaParser } from './bigquery/services/bigquery-data-mart-schema.parser';
import { BigQueryDataMartSchemaProvider } from './bigquery/services/bigquery-data-mart-schema.provider';
import { BigQueryDataMartValidator } from './bigquery/services/bigquery-datamart.validator';
import { BigQueryQueryBuilder } from './bigquery/services/bigquery-query.builder';
import { BigQueryReportHeadersGenerator } from './bigquery/services/bigquery-report-headers-generator.service';
import { BigQueryReportReader } from './bigquery/services/bigquery-report-reader.service';
import { BigQuerySchemaMerger } from './bigquery/services/bigquery-schema-merger';
import { BigquerySqlDryRunExecutor } from './bigquery/services/bigquery-sql-dry-run.executor';
import { BigQuerySqlRunExecutor } from './bigquery/services/bigquery-sql-run.executor';
import { LegacyBigQueryAccessValidator } from './bigquery/services/legacy/legacy-bigquery-access.validator';
import { LegacyBigQueryCreateViewExecutor } from './bigquery/services/legacy/legacy-bigquery-create-view.executor';
import { LegacyBigQueryDataMartSchemaParser } from './bigquery/services/legacy/legacy-bigquery-data-mart-schema.parser';
import { LegacyBigQueryDataMartSchemaProvider } from './bigquery/services/legacy/legacy-bigquery-data-mart-schema.provider';
import { LegacyBigQueryDataMartValidator } from './bigquery/services/legacy/legacy-bigquery-datamart.validator';
import { LegacyBigQueryQueryBuilder } from './bigquery/services/legacy/legacy-bigquery-query.builder';
import { LegacyBigQueryReportHeadersGenerator } from './bigquery/services/legacy/legacy-bigquery-report-headers-generator.service';
import { LegacyBigQueryReportReader } from './bigquery/services/legacy/legacy-bigquery-report-reader.service';
import { LegacyBigQuerySchemaMerger } from './bigquery/services/legacy/legacy-bigquery-schema-merger';
import { LegacyBigQuerySqlDryRunExecutor } from './bigquery/services/legacy/legacy-bigquery-sql-dry-run.executor';
import { LegacyBigQuerySqlPreprocessor } from './bigquery/services/legacy/legacy-bigquery-sql-preprocessor.service';
import { LegacyBigQuerySqlRunExecutor } from './bigquery/services/legacy/legacy-bigquery-sql-run.executor';
import { DataStorageCredentialsUtils } from './data-mart-schema.utils';
import { DatabricksApiAdapterFactory } from './databricks/adapters/databricks-api-adapter.factory';
import { DatabricksAccessValidator } from './databricks/services/databricks-access.validator';
import { DatabricksCreateViewExecutor } from './databricks/services/databricks-create-view.executor';
import { DatabricksDataMartSchemaParser } from './databricks/services/databricks-data-mart-schema.parser';
import { DatabricksDataMartSchemaProvider } from './databricks/services/databricks-data-mart-schema.provider';
import { DatabricksDataMartValidator } from './databricks/services/databricks-datamart.validator';
import { DatabricksQueryBuilder } from './databricks/services/databricks-query.builder';
import { DatabricksReportHeadersGenerator } from './databricks/services/databricks-report-headers-generator.service';
import { DatabricksReportReader } from './databricks/services/databricks-report-reader.service';
import { DatabricksSchemaMerger } from './databricks/services/databricks-schema-merger';
import { DatabricksSqlDryRunExecutor } from './databricks/services/databricks-sql-dry-run.executor';
import { DatabricksSqlRunExecutor } from './databricks/services/databricks-sql-run.executor';
import { DataStorageType } from './enums/data-storage-type.enum';
import { DataStoragePublicCredentialsFactory } from './factories/data-storage-public-credentials.factory';
import { CreateViewExecutor } from './interfaces/create-view-executor.interface';
import {
  DataMartQueryBuilder,
  DataMartQueryBuilderAsync,
} from './interfaces/data-mart-query-builder.interface';
import { DataMartSchemaMerger } from './interfaces/data-mart-schema-merger.interface';
import { DataMartSchemaParser } from './interfaces/data-mart-schema-parser.interface';
import { DataMartSchemaProvider } from './interfaces/data-mart-schema-provider.interface';
import { DataMartValidator } from './interfaces/data-mart-validator.interface';
import { DataStorageAccessValidator } from './interfaces/data-storage-access-validator.interface';
import { DataStorageReportReader } from './interfaces/data-storage-report-reader.interface';
import { ReportHeadersGenerator } from './interfaces/report-headers-generator.interface';
import { SqlDryRunExecutor } from './interfaces/sql-dry-run-executor.interface';
import { SqlRunExecutor } from './interfaces/sql-run-executor.interface';
import { RedshiftApiAdapterFactory } from './redshift/adapters/redshift-api-adapter.factory';
import { RedshiftAccessValidator } from './redshift/services/redshift-access.validator';
import { RedshiftCreateViewExecutor } from './redshift/services/redshift-create-view.executor';
import { RedshiftDataMartSchemaParser } from './redshift/services/redshift-data-mart-schema.parser';
import { RedshiftDataMartSchemaProvider } from './redshift/services/redshift-data-mart-schema.provider';
import { RedshiftDataMartValidator } from './redshift/services/redshift-datamart.validator';
import { RedshiftQueryBuilder } from './redshift/services/redshift-query.builder';
import { RedshiftReportHeadersGenerator } from './redshift/services/redshift-report-headers-generator.service';
import { RedshiftReportReader } from './redshift/services/redshift-report-reader.service';
import { RedshiftSchemaMerger } from './redshift/services/redshift-schema-merger';
import { RedshiftSqlDryRunExecutor } from './redshift/services/redshift-sql-dry-run.executor';
import { RedshiftSqlRunExecutor } from './redshift/services/redshift-sql-run.executor';
import { SnowflakeApiAdapterFactory } from './snowflake/adapters/snowflake-api-adapter.factory';
import { SnowflakeAccessValidator } from './snowflake/services/snowflake-access.validator';
import { SnowflakeCreateViewExecutor } from './snowflake/services/snowflake-create-view.executor';
import { SnowflakeDataMartSchemaParser } from './snowflake/services/snowflake-data-mart-schema.parser';
import { SnowflakeDataMartSchemaProvider } from './snowflake/services/snowflake-data-mart-schema.provider';
import { SnowflakeDataMartValidator } from './snowflake/services/snowflake-datamart.validator';
import { SnowflakeQueryBuilder } from './snowflake/services/snowflake-query.builder';
import { SnowflakeReportHeadersGenerator } from './snowflake/services/snowflake-report-headers-generator.service';
import { SnowflakeReportReader } from './snowflake/services/snowflake-report-reader.service';
import { SnowflakeSchemaMerger } from './snowflake/services/snowflake-schema-merger';
import { SnowflakeSqlDryRunExecutor } from './snowflake/services/snowflake-sql-dry-run.executor';
import { SnowflakeSqlRunExecutor } from './snowflake/services/snowflake-sql-run.executor';

export const DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER = Symbol(
  'DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER'
);
export const DATA_STORAGE_REPORT_READER_RESOLVER = Symbol('DATA_STORAGE_REPORT_READER_RESOLVER');
export const DATA_MART_VALIDATOR_RESOLVER = Symbol('DATA_MART_VALIDATOR_RESOLVER');
export const DATA_MART_SCHEMA_PROVIDER_RESOLVER = Symbol('DATA_MART_SCHEMA_PROVIDER_RESOLVER');
export const DATA_MART_SCHEMA_MERGER_RESOLVER = Symbol('DATA_MART_SCHEMA_MERGER_RESOLVER');
export const DATA_MART_SCHEMA_PARSER_RESOLVER = Symbol('DATA_MART_SCHEMA_PARSER_RESOLVER');
export const DATA_MART_QUERY_BUILDER_RESOLVER = Symbol('DATA_MART_QUERY_BUILDER_RESOLVER');
export const REPORT_HEADERS_GENERATOR_RESOLVER = Symbol('REPORT_HEADERS_GENERATOR_RESOLVER');
export const SQL_DRY_RUN_EXECUTOR_RESOLVER = Symbol('SQL_DRY_RUN_EXECUTOR_RESOLVER');
export const SQL_RUN_EXECUTOR_RESOLVER = Symbol('SQL_RUN_EXECUTOR_RESOLVER');
export const CREATE_VIEW_EXECUTOR_RESOLVER = Symbol('CREATE_VIEW_EXECUTOR_RESOLVER');

const accessValidatorProviders = [
  BigQueryAccessValidator,
  LegacyBigQueryAccessValidator,
  AthenaAccessValidator,
  SnowflakeAccessValidator,
  RedshiftAccessValidator,
  DatabricksAccessValidator,
];
const storageDataProviders = [
  BigQueryReportReader,
  LegacyBigQueryReportReader,
  AthenaReportReader,
  SnowflakeReportReader,
  RedshiftReportReader,
  DatabricksReportReader,
];
const adapterFactories = [
  BigQueryApiAdapterFactory,
  AthenaApiAdapterFactory,
  S3ApiAdapterFactory,
  SnowflakeApiAdapterFactory,
  RedshiftApiAdapterFactory,
  DatabricksApiAdapterFactory,
];
const queryBuilderProviders = [
  AthenaQueryBuilder,
  BigQueryQueryBuilder,
  LegacyBigQueryQueryBuilder,
  SnowflakeQueryBuilder,
  RedshiftQueryBuilder,
  DatabricksQueryBuilder,
];
const validatorProviders = [
  BigQueryDataMartValidator,
  LegacyBigQueryDataMartValidator,
  AthenaDataMartValidator,
  SnowflakeDataMartValidator,
  RedshiftDataMartValidator,
  DatabricksDataMartValidator,
];
const dataMartSchemaProviders = [
  BigQueryDataMartSchemaProvider,
  LegacyBigQueryDataMartSchemaProvider,
  AthenaDataMartSchemaProvider,
  SnowflakeDataMartSchemaProvider,
  RedshiftDataMartSchemaProvider,
  DatabricksDataMartSchemaProvider,
];
const dataMartSchemaMergerProviders = [
  BigQuerySchemaMerger,
  LegacyBigQuerySchemaMerger,
  AthenaSchemaMerger,
  SnowflakeSchemaMerger,
  RedshiftSchemaMerger,
  DatabricksSchemaMerger,
];
const schemaParserProviders = [
  BigQueryDataMartSchemaParser,
  LegacyBigQueryDataMartSchemaParser,
  AthenaDataMartSchemaParser,
  SnowflakeDataMartSchemaParser,
  RedshiftDataMartSchemaParser,
  DatabricksDataMartSchemaParser,
];
const reportHeadersGeneratorProviders = [
  BigQueryReportHeadersGenerator,
  LegacyBigQueryReportHeadersGenerator,
  AthenaReportHeadersGenerator,
  SnowflakeReportHeadersGenerator,
  RedshiftReportHeadersGenerator,
  DatabricksReportHeadersGenerator,
];
const sqlDryRunExecutorProviders = [
  BigquerySqlDryRunExecutor,
  LegacyBigQuerySqlDryRunExecutor,
  AthenaSqlDryRunExecutor,
  SnowflakeSqlDryRunExecutor,
  RedshiftSqlDryRunExecutor,
  DatabricksSqlDryRunExecutor,
];
const sqlRunExecutorProviders = [
  BigQuerySqlRunExecutor,
  LegacyBigQuerySqlRunExecutor,
  AthenaSqlRunExecutor,
  SnowflakeSqlRunExecutor,
  RedshiftSqlRunExecutor,
  DatabricksSqlRunExecutor,
];
const createViewExecutorProviders = [
  BigQueryCreateViewExecutor,
  LegacyBigQueryCreateViewExecutor,
  AthenaCreateViewExecutor,
  SnowflakeCreateViewExecutor,
  RedshiftCreateViewExecutor,
  DatabricksCreateViewExecutor,
];
const publicCredentialsProviders = [
  DataStoragePublicCredentialsFactory,
  DataStorageCredentialsUtils,
];
const legacyBigQueryProviders = [LegacyBigQuerySqlPreprocessor];

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
  ...legacyBigQueryProviders,
  {
    provide: DATA_MART_QUERY_BUILDER_RESOLVER,
    useFactory: async (...builders: (DataMartQueryBuilder | DataMartQueryBuilderAsync)[]) =>
      new TypeResolver<DataStorageType, DataMartQueryBuilder | DataMartQueryBuilderAsync>(builders),
    inject: queryBuilderProviders,
  },
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
