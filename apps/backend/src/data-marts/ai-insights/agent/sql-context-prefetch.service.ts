import { Injectable } from '@nestjs/common';
import { PrefetchStepTelemetry } from '../../../common/ai-insights/agent/types';
import { PrefetchedSqlContext, GetMetadataOutput } from '../ai-insights-types';
import { filterConnectedSchema } from '../utils/narrow-datamart-metadata';
import { DataMartService } from '../../services/data-mart.service';
import { TableNameRetrieverTool } from '../tools/table-name-retriever.tool';

export interface SqlContextPrefetchInput {
  projectId: string;
  dataMartId: string;
}
// refresh metadata if it was loaded more than 30 minutes ago.
const SCHEMA_EXPIRES_AFTER_MS = 30 * 60 * 1000;

@Injectable()
export class AiAssistantSqlContextPrefetchService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly tableNameRetrieverTool: TableNameRetrieverTool
  ) {}

  async prefetch(input: SqlContextPrefetchInput): Promise<PrefetchedSqlContext> {
    const startedAt = Date.now();
    const steps: PrefetchStepTelemetry[] = [
      {
        name: 'load_metadata',
      },
      {
        name: 'load_fqn',
      },
    ];

    const metadataPromise = this.loadMetadata(input);
    const fqnPromise = this.tableNameRetrieverTool.retrieveTableName(
      input.dataMartId,
      input.projectId
    );

    const [metadata, fullyQualifiedTableName] = await Promise.all([metadataPromise, fqnPromise]);

    return {
      metadata,
      fullyQualifiedTableName,
      telemetry: {
        totalMs: Date.now() - startedAt,
        steps,
      },
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
