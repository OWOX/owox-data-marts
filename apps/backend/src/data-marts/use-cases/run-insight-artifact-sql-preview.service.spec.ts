import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { DataMartSqlTableService } from '../services/data-mart-sql-table.service';
import { DataMartTableReferenceService } from '../services/data-mart-table-reference.service';
import { InsightArtifactService } from '../services/insight-artifact.service';
import { RunInsightArtifactSqlPreviewCommand } from '../dto/domain/run-insight-artifact-sql-preview.command';
import { RunInsightArtifactSqlPreviewService } from './run-insight-artifact-sql-preview.service';

describe('RunInsightArtifactSqlPreviewService', () => {
  const createService = () => {
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
      markValidationStatus: jest.fn().mockResolvedValue(undefined),
    };
    const dataMartSqlTableService = {
      resolveDataMartTableMacro: jest.fn(),
      executeSqlToTable: jest.fn(),
    };
    const dataMartTableReferenceService = {
      ensureSqlViewIsUpToDate: jest.fn().mockResolvedValue('project.dataset.view_dm_1'),
    };

    return {
      service: new RunInsightArtifactSqlPreviewService(
        insightArtifactService as never as InsightArtifactService,
        dataMartSqlTableService as never as DataMartSqlTableService,
        dataMartTableReferenceService as never as DataMartTableReferenceService
      ),
      insightArtifactService,
      dataMartSqlTableService,
      dataMartTableReferenceService,
    };
  };

  it('refreshes SQL Data Mart view before preview even when artifact SQL has no macro', async () => {
    const {
      service,
      insightArtifactService,
      dataMartSqlTableService,
      dataMartTableReferenceService,
    } = createService();

    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
    };
    const artifact = {
      id: 'artifact-1',
      title: 'Orders source',
      sql: 'SELECT * FROM project.dataset.view_dm_1 LIMIT 10',
      dataMart,
    };

    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(artifact);
    dataMartSqlTableService.resolveDataMartTableMacro.mockImplementation(async (_dm, sql) => sql);
    dataMartSqlTableService.executeSqlToTable.mockResolvedValue({
      columns: ['test'],
      rows: [[1]],
    });

    const result = await service.run(
      new RunInsightArtifactSqlPreviewCommand('artifact-1', 'dm-1', 'proj-1')
    );

    expect(dataMartTableReferenceService.ensureSqlViewIsUpToDate).toHaveBeenCalledWith(dataMart);
    expect(dataMartSqlTableService.resolveDataMartTableMacro).toHaveBeenCalledWith(
      dataMart,
      artifact.sql
    );
    expect(dataMartSqlTableService.executeSqlToTable).toHaveBeenCalledWith(dataMart, artifact.sql, {
      limit: 10,
    });
    expect(insightArtifactService.markValidationStatus).toHaveBeenCalledWith(
      artifact.id,
      InsightArtifactValidationStatus.VALID,
      null
    );
    expect(result.columns).toEqual(['test']);
    expect(result.rows).toEqual([[1]]);
  });
});
