import { Injectable } from '@nestjs/common';
import { IdentifierEscaperFacade } from '../data-storage-types/facades/identifier-escaper.facade';
import { DataMartService } from './data-mart.service';
import { DataMartSqlTableService } from './data-mart-sql-table.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';

export interface SampleTableDataResult {
  columns: string[];
  rows: unknown[][];
}

@Injectable()
export class DataMartSampleDataService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartSqlTableService: DataMartSqlTableService,
    private readonly dataMartTableReferenceService: DataMartTableReferenceService,
    private readonly identifierEscaperFacade: IdentifierEscaperFacade
  ) {}

  async sampleColumns(
    dataMartId: string,
    projectId: string,
    columns: string[],
    fullyQualifiedTableName?: string,
    limit = 5
  ): Promise<SampleTableDataResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const fqn =
      fullyQualifiedTableName ??
      (await this.dataMartTableReferenceService.resolveTableName(dataMartId, projectId));

    const storageType = dataMart.storage.type;
    const escapedColumns = await Promise.all(
      columns.map(column => this.identifierEscaperFacade.escapeIdentifier(storageType, column))
    );
    const escapedFqn = await this.identifierEscaperFacade.escapeIdentifier(storageType, fqn);
    const sql = `SELECT ${escapedColumns.join(', ')} FROM ${escapedFqn} LIMIT ${limit}`;

    const result = await this.dataMartSqlTableService.executeSqlToTable(dataMart, sql, { limit });

    return {
      columns: result.columns,
      rows: result.rows,
    };
  }
}
