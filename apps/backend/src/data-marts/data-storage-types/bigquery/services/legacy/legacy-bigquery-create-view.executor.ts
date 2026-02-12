import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../../data-storage-credentials.type';
import { DataStorageConfig } from '../../../data-storage-config.type';
import { BigQueryCreateViewExecutor } from '../bigquery-create-view.executor';
import { LegacyBigQuerySqlPreprocessor } from './legacy-bigquery-sql-preprocessor.service';

@Injectable()
export class LegacyBigQueryCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.LEGACY_GOOGLE_BIGQUERY;

  constructor(
    private readonly preprocessor: LegacyBigQuerySqlPreprocessor,
    private readonly executor: BigQueryCreateViewExecutor
  ) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    const preparedSql = await this.preprocessor.prepare(sql);
    return this.executor.createView(credentials, config, viewName, preparedSql);
  }
}
