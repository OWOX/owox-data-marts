import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const PROJECT_REINDEX_TRIGGER_TABLES = [
  {
    name: 'search_data_mart_project_reindex_triggers',
    readyIndex: 'idx_search_data_mart_project_reindex_trigger_ready',
    projectIndex: 'idx_search_data_mart_project_reindex_trigger_project',
  },
  {
    name: 'search_data_storage_project_reindex_triggers',
    readyIndex: 'idx_search_data_storage_project_reindex_trigger_ready',
    projectIndex: 'idx_search_data_storage_project_reindex_trigger_project',
  },
  {
    name: 'search_data_destination_project_reindex_triggers',
    readyIndex: 'idx_search_data_destination_project_reindex_trigger_ready',
    projectIndex: 'idx_search_data_destination_project_reindex_trigger_project',
  },
];

export class CreateSearchProjectReindexTriggerTables1782131671354 implements MigrationInterface {
  public readonly name = 'CreateSearchProjectReindexTriggerTables1782131671354';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tableConfig of PROJECT_REINDEX_TRIGGER_TABLES) {
      if (await queryRunner.hasTable(tableConfig.name)) {
        continue;
      }

      await queryRunner.createTable(
        new Table({
          name: tableConfig.name,
          columns: [
            new TableColumn({ name: 'id', type: 'varchar', length: '36', isPrimary: true }),
            new TableColumn({ name: 'isActive', type: 'boolean' }),
            new TableColumn({ name: 'version', type: 'int' }),
            new TableColumn({ name: 'status', type: 'varchar', length: '16', default: "'IDLE'" }),
            new TableColumn({ name: 'projectId', type: 'varchar', length: '255' }),
            new TableColumn({
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            }),
            new TableColumn({
              name: 'modifiedAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            }),
          ],
          indices: [
            new TableIndex({
              name: tableConfig.readyIndex,
              columnNames: ['isActive', 'status'],
            }),
            new TableIndex({
              name: tableConfig.projectIndex,
              columnNames: ['projectId', 'status'],
            }),
          ],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tableConfig of [...PROJECT_REINDEX_TRIGGER_TABLES].reverse()) {
      await softDropTable(queryRunner, tableConfig.name);
    }
  }
}
