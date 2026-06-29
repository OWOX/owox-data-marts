import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

export class AddDataMartRelationshipSearchIndex1782131671355 implements MigrationInterface {
  public readonly name = 'AddDataMartRelationshipSearchIndex1782131671355';

  private readonly tableName = 'data_mart_relationship';
  private readonly indexName = 'IDX_dmr_project_target_source';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.tableName);
    if (table.indices.some(index => index.name === this.indexName)) {
      return;
    }

    await queryRunner.createIndex(
      table,
      new TableIndex({
        name: this.indexName,
        columnNames: ['projectId', 'targetDataMartId', 'sourceDataMartId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.tableName);
    if (table.indices.some(index => index.name === this.indexName)) {
      await queryRunner.dropIndex(table, this.indexName);
    }
  }
}
