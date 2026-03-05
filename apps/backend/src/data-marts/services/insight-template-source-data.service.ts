import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataTableHeader } from '../../common/template/handlers/base/table-tag.handler';
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
import { DEFAULT_SOURCE_KEY } from '../../common/template/handlers/tag-handler.interface';
import { ReportHeadersGeneratorFacade } from '../data-storage-types/facades/report-headers-generator.facade';
import { castError } from '@owox/internal-helpers';

const MAX_LOADED_SOURCE = 100;

export interface InsightTemplateTableSourceContext {
  dataHeaders: DataTableHeader[];
  dataRows: unknown[][];
  dataHeadersCount: number;
  dataRowsCount: number;
}

@Injectable()
export class InsightTemplateSourceDataService {
  private readonly logger = new Logger(InsightTemplateSourceDataService.name);

  constructor(
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly insightArtifactService: InsightArtifactService,
    private readonly validationService: InsightTemplateValidationService,
    private readonly reportHeadersGeneratorFacade: ReportHeadersGeneratorFacade
  ) {}

  async buildRenderContext(
    dataMart: DataMart,
    insightTemplate: InsightTemplate
  ): Promise<{ tableSources: Record<string, InsightTemplateTableSourceContext> }> {
    await this.validationService.validateSources(insightTemplate.sources, {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
    });

    const tableSources: Record<string, InsightTemplateTableSourceContext> = {};
    tableSources[DEFAULT_SOURCE_KEY] = await this.resolveMainDataMartSourceContext(dataMart);

    for (const source of insightTemplate.sources ?? []) {
      tableSources[source.key] = await this.resolveSourceContext(source, dataMart);
    }

    return { tableSources };
  }

  private async resolveSourceContext(
    source: InsightTemplateSource,
    dataMart: DataMart
  ): Promise<InsightTemplateTableSourceContext> {
    if (source.type === InsightTemplateSourceType.CURRENT_DATA_MART) {
      return this.resolveCurrentDataMartSourceContext(dataMart);
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
          limit: MAX_LOADED_SOURCE,
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
      const message = castError(error).message;
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

  private async resolveCurrentDataMartSourceContext(
    dataMart: DataMart,
    aliasByName?: ReadonlyMap<string, string>
  ): Promise<InsightTemplateTableSourceContext> {
    const { columns, rows } = await this.dataMartSqlTableService.executeSqlToTable(
      dataMart,
      undefined,
      {
        limit: MAX_LOADED_SOURCE,
      }
    );

    return this.buildContext(columns, rows, aliasByName);
  }

  private async prepareArtifactSql(artifact: InsightArtifact, dataMart: DataMart): Promise<string> {
    return this.dataMartSqlTableService.resolveDataMartTableMacro(dataMart, artifact.sql ?? '');
  }

  private buildContext(
    columns: string[],
    rows: unknown[][],
    aliasByName?: ReadonlyMap<string, string>
  ): InsightTemplateTableSourceContext {
    const dataHeaders: DataTableHeader[] = columns.map(name => {
      const alias = aliasByName?.get(name);
      return alias ? { name, alias } : { name };
    });
    const dataRows = rows;

    return {
      dataHeaders,
      dataRows,
      dataHeadersCount: dataHeaders.length,
      dataRowsCount: dataRows.length,
    };
  }

  private async resolveMainDataMartSourceContext(
    dataMart: DataMart
  ): Promise<InsightTemplateTableSourceContext> {
    const aliasByName = await this.resolveMainSourceAliases(dataMart);
    return this.resolveCurrentDataMartSourceContext(dataMart, aliasByName);
  }

  private async resolveMainSourceAliases(
    dataMart: DataMart
  ): Promise<ReadonlyMap<string, string> | undefined> {
    if (!dataMart.schema || !dataMart.storage?.type) {
      return undefined;
    }

    try {
      const headers = await this.reportHeadersGeneratorFacade.generateHeadersFromSchema(
        dataMart.storage.type,
        dataMart.schema
      );
      const aliases = headers
        .filter(header => typeof header.alias === 'string' && header.alias.trim().length > 0)
        .map(header => [header.name, header.alias!.trim()] as const);

      if (!aliases.length) {
        return undefined;
      }

      return new Map(aliases);
    } catch (error) {
      this.logger.warn(
        `Alias enrichment for source="${DEFAULT_SOURCE_KEY}" failed for dataMart="${dataMart.id}": ${castError(error).stack}`
      );
      return undefined;
    }
  }
}
