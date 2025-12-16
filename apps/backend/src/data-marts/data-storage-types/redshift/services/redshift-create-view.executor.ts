import { Injectable } from '@nestjs/common';
import {
  CreateViewExecutor,
  CreateViewResult,
} from '../../interfaces/create-view-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class RedshiftCreateViewExecutor implements CreateViewExecutor {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(private readonly adapterFactory: RedshiftApiAdapterFactory) {}

  async createView(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    viewName: string,
    sql: string
  ): Promise<CreateViewResult> {
    if (!isRedshiftConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    const fullyQualifiedName = this.escapeIdentifier(viewName);

    const parts = viewName.split('.');
    if (parts.length >= 2) {
      const schemaName = parts.length === 3 ? parts[1] : parts[0];
      const createSchemaQuery = `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`;

      const { statementId: schemaStatementId } = await adapter.executeQuery(createSchemaQuery);
      await adapter.waitForQueryToComplete(schemaStatementId);
    }

    const createViewQuery = `CREATE OR REPLACE VIEW ${fullyQualifiedName} AS ${sql}`;
    const { statementId } = await adapter.executeQuery(createViewQuery);

    await adapter.waitForQueryToComplete(statementId);
    return { fullyQualifiedName };
  }

  private escapeIdentifier(identifier: string): string {
    return identifier
      .split('.')
      .map(part => (part.startsWith('"') && part.endsWith('"') ? part : `"${part}"`))
      .join('.');
  }
}
