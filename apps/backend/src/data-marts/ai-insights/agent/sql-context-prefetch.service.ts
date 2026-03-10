import { Injectable, Logger } from '@nestjs/common';
import { PrefetchedSqlContext, GetMetadataOutput, PrefetchSqlResult } from '../ai-insights-types';
import { filterConnectedSchema } from '../utils/narrow-datamart-metadata';
import { DataMartService } from '../../services/data-mart.service';
import { TableNameRetrieverTool } from '../tools/table-name-retriever.tool';
import {
  MeasuredExecutionSuccessResult,
  measureExecutionTime,
  toMeasuredExecutionBaseResult,
} from '../../../common/utils/measure-execution-time';

export interface SqlContextPrefetchInput {
  projectId: string;
  dataMartId: string;
}
// refresh metadata if it was loaded more than 30 minutes ago.
const SCHEMA_EXPIRES_AFTER_MS = 30 * 60 * 1000;

@Injectable()
export class AiAssistantSqlContextPrefetchService {
  private readonly logger = new Logger(AiAssistantSqlContextPrefetchService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly tableNameRetrieverTool: TableNameRetrieverTool
  ) {}

  async prefetch(input: SqlContextPrefetchInput): Promise<PrefetchedSqlContext> {
    const measured: MeasuredExecutionSuccessResult<PrefetchSqlResult> = await measureExecutionTime(
      () => this.runPrefetch(input),
      {
        onMeasured: measuredExecution => {
          this.logger.log('AiAssistantSqlContextPrefetch', {
            measured: toMeasuredExecutionBaseResult(measuredExecution),
          });
        },
      }
    );

    return {
      result: measured.result,
      telemetry: {
        totalMs: measured.executionTimeMs,
        steps: [{ name: 'load_metadata' }, { name: 'load_fqn' }],
      },
    };
  }

  private async runPrefetch(input: SqlContextPrefetchInput): Promise<PrefetchSqlResult> {
    const metadataPromise = this.loadMetadata(input);
    const fqnPromise = this.tableNameRetrieverTool.retrieveTableName(
      input.dataMartId,
      input.projectId
    );

    const [metadata, fullyQualifiedTableName] = await Promise.all([metadataPromise, fqnPromise]);

    return {
      metadata,
      fullyQualifiedTableName,
    };
  }

  private async loadMetadata(input: SqlContextPrefetchInput): Promise<GetMetadataOutput> {
    const dataMart = await this.dataMartService.actualizeSchemaIfExpired(
      input.dataMartId,
      input.projectId,
      SCHEMA_EXPIRES_AFTER_MS
    );

    return {
      title: dataMart.title,
      description: dataMart.description,
      storageType: dataMart.storage.type,
      schema: filterConnectedSchema(dataMart.schema!),
    };
  }
}
