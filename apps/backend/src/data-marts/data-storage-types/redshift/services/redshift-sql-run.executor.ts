import { Injectable } from '@nestjs/common';
import { SqlRunExecutor } from '../../interfaces/sql-run-executor.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { SqlRunBatch } from '../../../dto/domain/sql-run-batch.dto';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class RedshiftSqlRunExecutor implements SqlRunExecutor {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(private readonly adapterFactory: RedshiftApiAdapterFactory) {}

  async *execute<Row = Record<string, unknown>>(
    credentials: DataStorageCredentials,
    config: DataStorageConfig,
    _definition: DataMartDefinition,
    sql: string | undefined,
    _options?: { maxRowsPerBatch?: number }
  ): AsyncIterable<SqlRunBatch<Row>> {
    if (!isRedshiftConfig(config)) {
      throw new Error('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      throw new Error('Incompatible data storage credentials');
    }

    if (!sql) {
      throw new Error('SQL query is required');
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      // Execute query
      const { statementId } = await adapter.executeQuery(sql);

      // Wait for completion
      await adapter.waitForQueryToComplete(statementId);

      // Fetch results with pagination
      let nextToken: string | undefined = undefined;

      do {
        const results = await adapter.getQueryResults(statementId, nextToken);

        if (!results.Records) {
          break;
        }

        // Map Redshift Field values to row objects
        const rows = results.Records.map(record => {
          const row: Record<string, unknown> = {};

          record.forEach((field, index) => {
            const columnName = results.ColumnMetadata?.[index]?.name || `column_${index}`;

            // Extract value from Field union type
            if (field.stringValue !== undefined) {
              row[columnName] = field.stringValue;
            } else if (field.longValue !== undefined) {
              row[columnName] = field.longValue;
            } else if (field.doubleValue !== undefined) {
              row[columnName] = field.doubleValue;
            } else if (field.booleanValue !== undefined) {
              row[columnName] = field.booleanValue;
            } else if (field.isNull) {
              row[columnName] = null;
            } else {
              row[columnName] = null;
            }
          });

          return row as Row;
        });

        yield new SqlRunBatch(rows, results.NextToken);

        nextToken = results.NextToken;
      } while (nextToken);
    } finally {
      // No cleanup needed for Redshift Data API
    }
  }
}
