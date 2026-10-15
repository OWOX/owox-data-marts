import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

const TABLE = 'plugin_action_execution';
const COLUMN = 'payloadsClearedAt';
const INDEX = 'idx_plugin_action_execution_payloads';

export class AddPluginActionExecutionPayloadsClearedAt1790900000002 implements MigrationInterface {
  public readonly name = 'AddPluginActionExecutionPayloadsClearedAt1790900000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn(TABLE, COLUMN))) {
      await queryRunner.addColumn(
        TABLE,
        new TableColumn({ name: COLUMN, type: 'datetime', isNullable: true, default: null })
      );
    }
    if (!(await hasIndex(queryRunner))) {
      await queryRunner.createIndex(
        TABLE,
        new TableIndex({ name: INDEX, columnNames: [COLUMN, 'finishedAt'] })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await hasIndex(queryRunner)) {
      await queryRunner.dropIndex(TABLE, INDEX);
    }
    if (await queryRunner.hasColumn(TABLE, COLUMN)) {
      await queryRunner.dropColumn(TABLE, COLUMN);
    }
  }
}

async function hasIndex(queryRunner: QueryRunner): Promise<boolean> {
  const table = await queryRunner.getTable(TABLE);
  return table?.indices.some(index => index.name === INDEX) ?? false;
}
