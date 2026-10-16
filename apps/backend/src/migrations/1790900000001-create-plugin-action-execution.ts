import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const TABLE = 'plugin_action_execution';

/**
 * `input` and `result` hold `JSON.stringify` text, not `json`: TypeORM parses a MySQL `json` value a
 * second time, so a stored string such as "12345" read back as a number, and MySQL's `json` also
 * reorders keys and refuses lone surrogates. MySQL gets `mediumtext` (16 MB); TypeORM's SQLite driver
 * has no `mediumtext`, so every other driver gets `text`.
 */
export class CreatePluginActionExecution1790900000001 implements MigrationInterface {
  public readonly name = 'CreatePluginActionExecution1790900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) {
      return;
    }

    const payloadType = queryRunner.connection.options.type === 'mysql' ? 'mediumtext' : 'text';

    await queryRunner.createTable(
      new Table({
        name: TABLE,
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
          { name: 'pluginVersionId', type: 'varchar', length: '36', isNullable: false },
          { name: 'installationId', type: 'varchar', length: '36', isNullable: false },
          { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
          { name: 'userId', type: 'varchar', length: '255', isNullable: false },
          { name: 'action', type: 'varchar', length: '64', isNullable: false },
          { name: 'input', type: payloadType, isNullable: true },
          { name: 'trigger', type: 'varchar', length: '16', isNullable: false },
          { name: 'status', type: 'varchar', length: '16', isNullable: false },
          { name: 'role', type: 'varchar', length: '16', isNullable: false },
          { name: 'tokenHash', type: 'varchar', length: '64', isNullable: true },
          { name: 'deadlineAt', type: 'datetime', isNullable: true, default: null },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'startedAt', type: 'datetime', isNullable: true, default: null },
          { name: 'finishedAt', type: 'datetime', isNullable: true, default: null },
          { name: 'errorCode', type: 'varchar', length: '64', isNullable: true },
          { name: 'errorMessage', type: 'varchar', length: '1000', isNullable: true },
          { name: 'result', type: payloadType, isNullable: true },
          { name: 'payloadsClearedAt', type: 'datetime', isNullable: true, default: null },
          // Bytes of `input` and `result` not yet cleared; the start limit sums it.
          { name: 'payloadBytes', type: 'int', isNullable: false, default: 0 },
        ],
      })
    );

    for (const index of [
      new TableIndex({
        name: 'UQ_plugin_action_execution_token',
        columnNames: ['tokenHash'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'idx_plugin_action_execution_running',
        columnNames: ['installationId', 'status'],
      }),
      new TableIndex({
        name: 'idx_plugin_action_execution_deadline',
        columnNames: ['status', 'deadlineAt'],
      }),
      new TableIndex({
        name: 'idx_plugin_action_execution_starts',
        columnNames: ['installationId', 'startedAt', 'payloadBytes'],
      }),
      new TableIndex({
        name: 'idx_plugin_action_execution_finished',
        columnNames: ['finishedAt'],
      }),
      new TableIndex({
        name: 'idx_plugin_action_execution_payloads',
        columnNames: ['payloadsClearedAt', 'finishedAt'],
      }),
    ]) {
      await queryRunner.createIndex(TABLE, index);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) {
      await softDropTable(queryRunner, TABLE);
    }
  }
}
