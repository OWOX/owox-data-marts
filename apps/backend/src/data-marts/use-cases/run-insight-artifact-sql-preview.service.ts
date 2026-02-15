import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InsightArtifactSqlPreviewDto } from '../dto/domain/insight-artifact-sql-preview.dto';
import { RunInsightArtifactSqlPreviewCommand } from '../dto/domain/run-insight-artifact-sql-preview.command';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { DataMart } from '../entities/data-mart.entity';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { DataMartSqlTableService } from '../services/data-mart-sql-table.service';
import { InsightArtifactService } from '../services/insight-artifact.service';

@Injectable()
export class RunInsightArtifactSqlPreviewService {
  constructor(
    private readonly insightArtifactService: InsightArtifactService,
    private readonly dataMartSqlTableService: DataMartSqlTableService
  ) {}

  async run(command: RunInsightArtifactSqlPreviewCommand): Promise<InsightArtifactSqlPreviewDto> {
    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      command.insightArtifactId,
      command.dataMartId,
      command.projectId
    );

    const shouldPersistValidationStatus = command.sql == null;

    try {
      const sql = await this.prepareSql(
        (command.sql ?? artifact.sql ?? '').trim(),
        artifact,
        artifact.dataMart
      );

      const { columns, rows } = await this.executePreview(artifact.dataMart, sql, command.limit);

      if (shouldPersistValidationStatus) {
        await this.insightArtifactService.markValidationStatus(
          artifact.id,
          InsightArtifactValidationStatus.VALID,
          null
        );
      }

      return new InsightArtifactSqlPreviewDto(columns, rows, rows.length, command.limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (shouldPersistValidationStatus) {
        await this.insightArtifactService.markValidationStatus(
          artifact.id,
          InsightArtifactValidationStatus.ERROR,
          message
        );
      }

      throw new BusinessViolationException(`Failed to execute SQL preview: ${message}`);
    }
  }

  private async prepareSql(
    sql: string,
    artifact: InsightArtifact,
    dataMart: DataMart
  ): Promise<string> {
    if (!sql) {
      throw new BusinessViolationException(`Artifact "${artifact.title}" SQL is empty`);
    }

    return this.dataMartSqlTableService.resolveDataMartTableMacro(dataMart, sql);
  }

  private async executePreview(
    dataMart: DataMart,
    sql: string,
    limit: number
  ): Promise<{ columns: string[]; rows: unknown[][] }> {
    return this.dataMartSqlTableService.executeSqlToTable(dataMart, sql, { limit });
  }
}
