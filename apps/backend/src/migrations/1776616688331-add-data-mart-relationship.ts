import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class AddDataMartRelationship1776616688331 implements MigrationInterface {
  public readonly name = 'AddDataMartRelationship1776616688331';

  private readonly RELATIONSHIP_TABLE = 'data_mart_relationship';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(this.RELATIONSHIP_TABLE)) {
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: this.RELATIONSHIP_TABLE,
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true, isNullable: false },
          { name: 'dataStorageId', type: 'varchar', length: '36', isNullable: false },
          { name: 'sourceDataMartId', type: 'varchar', length: '36', isNullable: false },
          { name: 'targetDataMartId', type: 'varchar', length: '36', isNullable: false },
          { name: 'targetAlias', type: 'varchar', length: '255', isNullable: false },
          { name: 'joinConditions', type: 'json', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          {
            columnNames: ['dataStorageId'],
            referencedTableName: 'data_storage',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          },
          {
            columnNames: ['sourceDataMartId'],
            referencedTableName: 'data_mart',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          },
          {
            columnNames: ['targetDataMartId'],
            referencedTableName: 'data_mart',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          },
        ],
      })
    );

    await queryRunner.createIndex(
      this.RELATIONSHIP_TABLE,
      new TableIndex({
        name: 'UQ_data_mart_relationship_source_alias',
        columnNames: ['sourceDataMartId', 'targetAlias'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      this.RELATIONSHIP_TABLE,
      new TableIndex({
        name: 'IDX_dmr_dataStorage',
        columnNames: ['dataStorageId'],
      })
    );

    await queryRunner.createIndex(
      this.RELATIONSHIP_TABLE,
      new TableIndex({
        name: 'IDX_dmr_targetDataMart',
        columnNames: ['targetDataMartId'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, this.RELATIONSHIP_TABLE);
  }
}
