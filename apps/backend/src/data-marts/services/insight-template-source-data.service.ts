import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataTableHeader } from '../../common/template/handlers/base/data-table-tag.handler';
import {
  InsightTemplateSource,
  InsightTemplateSourceType,
} from '../dto/schemas/insight-template/insight-template-source.schema';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightTemplate } from '../entities/insight-template.entity';
import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { DataMart } from '../entities/data-mart.entity';
import { InsightArtifactService } from './insight-artifact.service';
import { InsightTemplateValidationService } from './insight-template-validation.service';
import { DataMartSqlTableService } from './data-mart-sql-table.service';

const DEFAULT_SOURCE_KEY = 'main';
const MAX_SOURCE_ROWS_IN_MEMORY = 100;

export interface InsightTemplateTableSourceContext {
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
  dataHeadersCount: number;
  dataRowsCount: number;
}

@Injectable()
export class InsightTemplateSourceDataService {
  constructor(
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly validationService: InsightTemplateValidationService
  ) {}

  async buildRenderContext(
    dataMart: DataMart,
    insightTemplate: InsightTemplate
  ): Promise<{ tableSources: Record<string, InsightTemplateTableSourceContext> }> {
    await this.validationService.validateSources(insightTemplate.sources, {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });

    const sourceRegistry: InsightTemplateSource[] = [
      {
        key: DEFAULT_SOURCE_KEY,
        type: InsightTemplateSourceType.CURRENT_DATA_MART,
      },
      ...(insightTemplate.sources ?? []),
    ];

    const tableSources: Record<string, InsightTemplateTableSourceContext> = {};

    for (const source of sourceRegistry) {
      tableSources[source.key] = await this.resolveSourceContext(source, dataMart);
    }

    return { tableSources };
  }

  private async resolveSourceContext(
    source: InsightTemplateSource,
    dataMart: DataMart
  ): Promise<InsightTemplateTableSourceContext> {
    if (source.type === InsightTemplateSourceType.CURRENT_DATA_MART) {
      const { columns, rows } = await this.dataMartSqlTableService.executeSqlToTable(
        dataMart,
        undefined,
        {
          limit: MAX_SOURCE_ROWS_IN_MEMORY,
        }
      );

      return this.buildContext(columns, rows);
    }

    if (!source.artifactId) {
      throw new BusinessViolationException(`Source "${source.key}" must provide artifactId`);
    }

    const artifact = await this.insightArtifactService.getByIdAndDataMartIdAndProjectId(
      source.artifactId,
      dataMart.id,
      dataMart.projectId
    );

    if (artifact.validationStatus === InsightArtifactValidationStatus.ERROR) {
      throw new BusinessViolationException(
        `Source artifact "${artifact.title}" has SQL errors and cannot be used`
      );
    }

    try {
      const sql = await this.prepareArtifactSql(artifact, dataMart);
      const { columns, rows } = await this.dataMartSqlTableService.executeSqlToTable(
        dataMart,
        sql,
        {
          limit: MAX_SOURCE_ROWS_IN_MEMORY,
        }
      );
      const context = this.buildContext(columns, rows);

      if (artifact.validationStatus !== InsightArtifactValidationStatus.VALID) {
        await this.insightArtifactService.markValidationStatus(
          artifact.id,
          InsightArtifactValidationStatus.VALID,
          null
        );
      }

      return context;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.insightArtifactService.markValidationStatus(
        artifact.id,
        InsightArtifactValidationStatus.ERROR,
        message
      );
      throw new BusinessViolationException(
        `Failed to execute artifact source "${artifact.title}": ${message}`
      );
    }
  }

  private async prepareArtifactSql(artifact: InsightArtifact, dataMart: DataMart): Promise<string> {
    return this.dataMartSqlTableService.resolveDataMartTableMacro(dataMart, artifact.sql ?? '');
  }

  private buildContext(columns: string[], rows: unknown[][]): InsightTemplateTableSourceContext {
    const dataHeaders: DataTableHeader[] = columns.map(name => ({ name }));
    const dataRows = rows;

    return {
      dataHeaders,
      dataRows,
      dataHeadersCount: dataHeaders.length,
      dataRowsCount: dataRows.length,
    };
  }
}
