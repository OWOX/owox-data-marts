import { TypeResolver } from '../../common/resolver/type-resolver';
import { BigQueryIdentifierEscaper } from '../data-storage-types/bigquery/services/bigquery-identifier.escaper';
import { SnowflakeIdentifierEscaper } from '../data-storage-types/snowflake/services/snowflake-identifier.escaper';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { IdentifierEscaper } from '../data-storage-types/interfaces/identifier-escaper.interface';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartSampleDataService } from './data-mart-sample-data.service';

describe('DataMartSampleDataService', () => {
  const createDataMart = (storageType: DataStorageType): DataMart =>
    ({
      id: 'data-mart-1',
      projectId: 'project-1',
      storage: {
        type: storageType,
      },
    }) as unknown as DataMart;

  const createService = (storageType = DataStorageType.GOOGLE_BIGQUERY) => {
    const dataMart = createDataMart(storageType);
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
