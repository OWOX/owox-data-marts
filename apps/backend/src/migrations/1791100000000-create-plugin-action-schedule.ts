import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { getTable, softDropTable } from './migration-utils';

const SCHEDULE = 'plugin_action_schedule';
const EXECUTION = 'plugin_action_execution';
const SCHEDULE_INDEXES = [
  'idx_plugin_action_schedule_ready',
  'idx_plugin_action_schedule_installation',
];
const EXECUTION_INDEXES = [
  new TableIndex({
    name: 'idx_plugin_action_execution_schedule',
    columnNames: ['scheduleId', 'status'],
  }),
  new TableIndex({
    name: 'idx_plugin_action_execution_queue',
    columnNames: ['installationId', 'status', 'queuedAt'],
  }),
];

/** `parameters` is JSON text like execution payloads; 64 KiB of it is a byte over MySQL `text`. */
export class CreatePluginActionSchedule1791100000000 implements MigrationInterface {
  public readonly name = 'CreatePluginActionSchedule1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(SCHEDULE))) {
      await queryRunner.createTable(
        new Table({
          name: SCHEDULE,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
            { name: 'installationId', type: 'varchar', length: '36', isNullable: false },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
            { name: 'action', type: 'varchar', length: '64', isNullable: false },
            {
              name: 'parameters',
              type: queryRunner.connection.options.type === 'mysql' ? 'mediumtext' : 'text',
              isNullable: true,
            },
            { name: 'name', type: 'varchar', length: '200', isNullable: true },
            { name: 'disabledReason', type: 'varchar', length: '32', isNullable: true },
            { name: 'lastExecutionId', type: 'varchar', length: '36', isNullable: true },
            { name: 'cronExpression', type: 'varchar', length: '255', isNullable: false },
            { name: 'timeZone', type: 'varchar', length: '255', isNullable: false },
            { name: 'nextRunTimestamp', type: 'datetime', isNullable: true },
            { name: 'lastRunTimestamp', type: 'datetime', isNullable: true },
            { name: 'isActive', type: 'boolean', isNullable: false },
            { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
            { name: 'version', type: 'int', isNullable: false },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
          indices: [
            {
              name: 'idx_plugin_action_schedule_ready',
              columnNames: ['isActive', 'status', 'nextRunTimestamp'],
            },
            { name: 'idx_plugin_action_schedule_installation', columnNames: ['installationId'] },
          ],
        })
      );
    }
    if (!(await queryRunner.hasColumn(EXECUTION, 'scheduleId'))) {
      await queryRunner.addColumn(
        EXECUTION,
        new TableColumn({ name: 'scheduleId', type: 'varchar', length: '36', isNullable: true })
      );
    }
    if (!(await queryRunner.hasColumn(EXECUTION, 'queuedAt'))) {
      await queryRunner.addColumn(
        EXECUTION,
        new TableColumn({ name: 'queuedAt', type: 'datetime', isNullable: true })
      );
    }
    for (const index of EXECUTION_INDEXES) {
      const table = await getTable(queryRunner, EXECUTION);
      if (!table.indices.some(existing => existing.name === index.name)) {
        await queryRunner.createIndex(EXECUTION, index);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Code without the queue never finishes a QUEUED row, and its reads would show it running forever.
    if (await queryRunner.hasColumn(EXECUTION, 'queuedAt')) {
      await queryRunner.query(
        `UPDATE ${EXECUTION} SET status = 'CANCELLED', finishedAt = CURRENT_TIMESTAMP WHERE status = 'QUEUED'`
      );
    }
    for (const index of EXECUTION_INDEXES) {
      const table = await getTable(queryRunner, EXECUTION);
      if (table.indices.some(existing => existing.name === index.name)) {
        await queryRunner.dropIndex(EXECUTION, index);
      }
    }
    for (const column of ['queuedAt', 'scheduleId']) {
      if (await queryRunner.hasColumn(EXECUTION, column)) {
        await queryRunner.dropColumn(EXECUTION, column);
      }
    }
    if (await queryRunner.hasTable(SCHEDULE)) {
      // SQLite index names are schema-wide: the backup would keep them and block the next up().
      for (const name of SCHEDULE_INDEXES) {
        const table = await getTable(queryRunner, SCHEDULE);
        if (table.indices.some(existing => existing.name === name)) {
          await queryRunner.dropIndex(SCHEDULE, name);
        }
      }
      await softDropTable(queryRunner, SCHEDULE);
    }
  }
}
