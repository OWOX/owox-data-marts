import { Injectable, Logger } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataStorageConfig } from '../../data-storage-config.type';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';

/**
 * Athena implementation for creating or replacing a View from a SQL query.
 * Uses Athena to execute DDL and waits for completion. S3 output is cleaned up after execution.
 */
@Injectable()
export class AthenaCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.AWS_ATHENA;
  private readonly logger = new Logger(AthenaCreateViewExecutor.name);

  constructor(
    private readonly athenaAdapterFactory: AthenaApiAdapterFactory,
    private readonly s3AdapterFactory: S3ApiAdapterFactory
  ) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    fullyQualifiedViewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isAthenaCredentials(credentials)) {
      throw new Error('Athena storage credentials expected');
    }
    if (!isAthenaConfig(config)) {
      throw new Error('Athena storage config expected');
    }

    if (!fullyQualifiedViewName || !sql) {
      throw new Error('View name and SQL must be provided');
    }

    const viewIdent = this.escapeTablePath(fullyQualifiedViewName);
    const ddl = `CREATE OR REPLACE VIEW ${viewIdent} AS ${sql}`;

    const athena = this.athenaAdapterFactory.create(credentials, config);
    const s3 = this.s3AdapterFactory.create(credentials, config);

    // unique output prefix to isolate result files, even for DDL
    const outputBucket = config.outputBucket;
    const outputPrefix = `owox-data-marts/ddl/${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    try {
      const { queryExecutionId } = await athena.executeQuery(ddl, outputBucket, outputPrefix);
      await athena.waitForQueryToComplete(queryExecutionId);
    } finally {
      try {
        await s3.cleanupOutputFiles(outputBucket, outputPrefix);
      } catch (cleanupError) {
        this.logger.error('Error cleaning up Athena DDL output files', cleanupError as Error);
      }
    }

    return { fullyQualifiedName: fullyQualifiedViewName };
  }

  // Escape each identifier segment for Athena (Trino/Presto dialect) using double quotes
  private escapeTablePath(tablePath: string): string {
    return tablePath
      .split('.')
      .map(identifier =>
        identifier.startsWith('"') && identifier.endsWith('"') ? identifier : `"${identifier}"`
      )
      .join('.');
  }
}
