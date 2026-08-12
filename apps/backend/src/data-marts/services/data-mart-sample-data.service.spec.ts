import { TypeResolver } from '../../common/resolver/type-resolver';
import { BigQueryIdentifierEscaper } from '../data-storage-types/bigquery/services/bigquery-identifier.escaper';
import { LegacyBigQueryIdentifierEscaper } from '../data-storage-types/bigquery/services/legacy/legacy-bigquery-identifier.escaper';
import { SnowflakeIdentifierEscaper } from '../data-storage-types/snowflake/services/snowflake-identifier.escaper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { IdentifierEscaper } from '../data-storage-types/interfaces/identifier-escaper.interface';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartSampleDataService } from './data-mart-sample-data.service';

describe('DataMartSampleDataService', () => {
  const createDataMart = (storageType: DataStorageType, definition?: unknown): DataMart =>
    ({
      id: 'data-mart-1',
      projectId: 'project-1',
      definition,
      storage: {
        type: storageType,
      },
    }) as unknown as DataMart;

  const createService = (storageType = DataStorageType.GOOGLE_BIGQUERY, definition?: unknown) => {
    const dataMart = createDataMart(storageType, definition);
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const dataMartSqlTableService = {
      executeSqlToTable: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
    };
    const dataMartTableReferenceService = {
      resolveTableName: jest.fn().mockResolvedValue('test-project.TestDataset.dashed-table-name'),
    };
    const identifierEscaperFacade = new IdentifierEscaperFacade(
      new TypeResolver<DataStorageType, IdentifierEscaper>([
        new BigQueryIdentifierEscaper(),
        new LegacyBigQueryIdentifierEscaper(),
        new SnowflakeIdentifierEscaper(),
      ])
    );

    return {
      service: new DataMartSampleDataService(
        dataMartService as never,
        dataMartSqlTableService as never,
        dataMartTableReferenceService as never,
        identifierEscaperFacade
      ),
      dataMart,
      dataMartSqlTableService,
      dataMartTableReferenceService,
    };
  };

  it('escapes a dashed table name and columns in the generated SQL', async () => {
    const { service, dataMart, dataMartSqlTableService } = createService();

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT `report_date` FROM `test-project`.`TestDataset`.`dashed-table-name` LIMIT 5',
      { limit: 5 }
    );
  });

  it('escapes an explicitly provided fully qualified table name without resolving it', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService();

    await service.sampleColumns(
      'data-mart-1',
      'project-1',
      ['report_date', 'amount'],
      'test-project.TestDataset.another-dashed-table',
      10
    );

    expect(dataMartTableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT `report_date`, `amount` FROM `test-project`.`TestDataset`.`another-dashed-table` LIMIT 10',
      { limit: 10 }
    );
  });

  it('inlines a SQL data mart as a derived table without touching the technical view', async () => {
    const { service, dataMart, dataMartSqlTableService, dataMartTableReferenceService } =
      createService(DataStorageType.GOOGLE_BIGQUERY, {
        sqlQuery: '  SELECT report_date, amount FROM `src.dataset.orders` ; ',
      });

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT `report_date` FROM (SELECT report_date, amount FROM `src.dataset.orders`\n) AS owox_sample_source LIMIT 5',
      { limit: 5 }
    );
  });

  it('inlines a WITH/CTE SQL data mart as a derived table on BigQuery', async () => {
    const { service, dataMart, dataMartSqlTableService, dataMartTableReferenceService } =
      createService(DataStorageType.GOOGLE_BIGQUERY, {
        sqlQuery: 'WITH src AS (SELECT 1 AS report_date) SELECT * FROM src;',
      });

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT `report_date` FROM (WITH src AS (SELECT 1 AS report_date) SELECT * FROM src\n) AS owox_sample_source LIMIT 5',
      { limit: 5 }
    );
  });

  it('keeps the technical-view path for legacy BigQuery, whose raw ODM SQL needs preprocessing', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService(
      DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      { sqlQuery: 'SELECT report_date FROM {{ source }}' }
    );

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).toHaveBeenCalledWith(
      'data-mart-1',
      'project-1'
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT `report_date` FROM `test-project`.`TestDataset`.`dashed-table-name` LIMIT 5',
      { limit: 5 }
    );
  });

  it('survives a trailing line comment in the inlined SQL definition', async () => {
    const { service, dataMart, dataMartSqlTableService } = createService(
      DataStorageType.GOOGLE_BIGQUERY,
      { sqlQuery: 'SELECT report_date FROM `src.dataset.orders` -- daily orders' }
    );

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT `report_date` FROM (SELECT report_date FROM `src.dataset.orders` -- daily orders\n) AS owox_sample_source LIMIT 5',
      { limit: 5 }
    );
  });

  it('keeps the technical-view path for a multi-statement SQL definition', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService(
      DataStorageType.GOOGLE_BIGQUERY,
      { sqlQuery: 'SELECT 1 AS report_date; SELECT 2 AS report_date' }
    );

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).toHaveBeenCalledWith(
      'data-mart-1',
      'project-1'
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT `report_date` FROM `test-project`.`TestDataset`.`dashed-table-name` LIMIT 5',
      { limit: 5 }
    );
  });

  it('keeps the technical-view path for WITH/CTE SQL on a storage without CTE-in-derived-table support', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService(
      DataStorageType.SNOWFLAKE,
      { sqlQuery: 'WITH src AS (SELECT 1 AS report_date) SELECT * FROM src' }
    );

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).toHaveBeenCalledWith(
      'data-mart-1',
      'project-1'
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT "report_date" FROM "test-project"."TestDataset"."dashed-table-name" LIMIT 5',
      { limit: 5 }
    );
  });

  it('inlines a plain SELECT on a non-BigQuery storage', async () => {
    const { service, dataMart, dataMartSqlTableService, dataMartTableReferenceService } =
      createService(DataStorageType.SNOWFLAKE, {
        sqlQuery: 'SELECT report_date FROM orders',
      });

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT "report_date" FROM (SELECT report_date FROM orders\n) AS owox_sample_source LIMIT 5',
      { limit: 5 }
    );
  });

  it('keeps the technical-view path for SQL that is neither SELECT nor WITH', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService(
      DataStorageType.GOOGLE_BIGQUERY,
      { sqlQuery: 'DECLARE x INT64; SELECT x AS report_date' }
    );

    await service.sampleColumns('data-mart-1', 'project-1', ['report_date']);

    expect(dataMartTableReferenceService.resolveTableName).toHaveBeenCalledWith(
      'data-mart-1',
      'project-1'
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT `report_date` FROM `test-project`.`TestDataset`.`dashed-table-name` LIMIT 5',
      { limit: 5 }
    );
  });

  it('prefers an explicitly provided table name over inlining the SQL definition', async () => {
    const { service, dataMartSqlTableService, dataMartTableReferenceService } = createService(
      DataStorageType.GOOGLE_BIGQUERY,
      { sqlQuery: 'SELECT 1 AS report_date' }
    );

    await service.sampleColumns(
      'data-mart-1',
      'project-1',
      ['report_date'],
      'test-project.TestDataset.explicit-table'
    );

    expect(dataMartTableReferenceService.resolveTableName).not.toHaveBeenCalled();
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT `report_date` FROM `test-project`.`TestDataset`.`explicit-table` LIMIT 5',
      { limit: 5 }
    );
  });

  it('neutralizes SQL breakout attempts in Snowflake column names', async () => {
    const { service, dataMart, dataMartSqlTableService } = createService(DataStorageType.SNOWFLAKE);

    await service.sampleColumns('data-mart-1', 'project-1', ['a.b.c.d FROM sensitive_table --']);

    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(
      dataMart,
      'SELECT "a"."b"."c"."d FROM sensitive_table --" FROM "test-project"."TestDataset"."dashed-table-name" LIMIT 5',
      { limit: 5 }
    );
  });
});
