import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

const EXECUTION = 'plugin_action_execution';
const INDEXES = [
  new TableIndex({
    name: 'idx_plugin_action_execution_project_created',
    columnNames: ['projectId', 'createdAt'],
  }),
  new TableIndex({
    name: 'idx_plugin_action_execution_project_user_created',
    columnNames: ['projectId', 'userId', 'createdAt'],
  }),
  new TableIndex({
    name: 'idx_plugin_action_execution_schedule_created',
    columnNames: ['scheduleId', 'createdAt'],
  }),
];

/**
 * Run History reads a project's runs newest first: an admin's all of them, a member's their own,
 * and one schedule's when filtered by it.
 */
export class AddPluginActionExecutionListIndexes1791200000000 implements MigrationInterface {
  public readonly name = 'AddPluginActionExecutionListIndexes1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const index of INDEXES) {
      const table = await getTable(queryRunner, EXECUTION);
      if (!table.indices.some(existing => existing.name === index.name)) {
        await queryRunner.createIndex(EXECUTION, index);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const index of INDEXES) {
      const table = await getTable(queryRunner, EXECUTION);
      if (table.indices.some(existing => existing.name === index.name)) {
        await queryRunner.dropIndex(EXECUTION, index);
      }
    }
  }
}
