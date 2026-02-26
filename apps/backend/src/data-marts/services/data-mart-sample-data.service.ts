import { Injectable } from '@nestjs/common';
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
    private readonly dataMartTableReferenceService: DataMartTableReferenceService
  ) {}

  async sampleColumns(
    dataMartId: string,
    projectId: string,
    columns: string[],
    limit = 5
  ): Promise<SampleTableDataResult> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const fqn = await this.dataMartTableReferenceService.resolveTableName(dataMartId, projectId);

    const columnList = columns.join(', ');
    const sql = `SELECT ${columnList} FROM ${fqn} LIMIT ${limit}`;

    const result = await this.dataMartSqlTableService.executeSqlToTable(dataMart, sql, { limit });

    return {
      columns: result.columns,
      rows: result.rows,
    };
  }
}
