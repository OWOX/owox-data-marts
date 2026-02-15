import { Injectable } from '@nestjs/common';
import { SqlRunCommand } from '../dto/domain/sql-run.command';
import { DataMart } from '../entities/data-mart.entity';
import { SqlRunService } from '../use-cases/sql-run.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';

const DATA_MART_TABLE_MACRO = '${DATA_MART_TABLE}';
const DEFAULT_SQL_RUN_BATCH_SIZE = 500;

interface ExecuteSqlToTableOptions {
  limit: number;
  batchSize?: number;
}

interface SqlTableResult {
  columns: string[];
  rows: unknown[][];
}

@Injectable()
export class DataMartSqlTableService {
  constructor(
    private readonly sqlRunService: SqlRunService,
    private readonly dataMartTableReferenceService: DataMartTableReferenceService
  ) {}

  async resolveDataMartTableMacro(dataMart: DataMart, sql: string): Promise<string> {
    if (!sql.includes(DATA_MART_TABLE_MACRO)) {
      return sql;
    }

    const tableName = await this.dataMartTableReferenceService.resolveTableName(
      dataMart.id,
      dataMart.projectId
    );

    return sql.replaceAll(DATA_MART_TABLE_MACRO, tableName);
  }

  async executeSqlToTable(
    dataMart: DataMart,
    sql: string | undefined,
    options: ExecuteSqlToTableOptions
  ): Promise<SqlTableResult> {
    const { limit, batchSize = DEFAULT_SQL_RUN_BATCH_SIZE } = options;
    if (limit <= 0) {
      return { columns: [], rows: [] };
    }

    const rowObjects: Record<string, unknown>[] = [];
    let columns: string[] = [];

    const command = new SqlRunCommand(dataMart.id, dataMart.projectId, sql, batchSize);

    outer: for await (const batch of this.sqlRunService.runBatches<Record<string, unknown>>(
      command
    )) {
      if (!columns.length && Array.isArray(batch.columns) && batch.columns.length > 0) {
        columns = batch.columns.filter(Boolean);
      }

      for (const row of batch.rows) {
        rowObjects.push(row);
        if (rowObjects.length >= limit) {
          break outer;
        }
      }
    }

    const headerNames = columns.length > 0 ? columns : Object.keys(rowObjects[0] ?? {});
    const rows = rowObjects.map(row => headerNames.map(name => row[name]));

    return { columns: headerNames, rows };
  }
}
