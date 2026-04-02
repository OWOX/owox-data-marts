import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';
import { softDropTable } from './migration-utils';

export class AddDataMartRelationship1774700000000 implements MigrationInterface {
  public readonly name = 'AddDataMartRelationship1774700000000';

  private readonly RELATIONSHIP_TABLE = 'data_mart_relationship';
  private readonly REPORT_TABLE = 'report';
  private readonly COLUMN_CONFIG_COLUMN = 'columnConfig';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
          { name: 'blendedFields', type: 'json', isNullable: false },
          { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
          { name: 'createdById', type: 'varchar', length: '255', isNullable: false },
          { name: 'createdAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      this.RELATIONSHIP_TABLE,
      new TableIndex({
        name: 'UQ_data_mart_relationship_source_alias',
        columnNames: ['sourceDataMartId', 'targetAlias'],
        isUnique: true,
      })
    );

    await queryRunner.createForeignKey(
      this.RELATIONSHIP_TABLE,
      new TableForeignKey({
        columnNames: ['dataStorageId'],
        referencedTableName: 'data_storage',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createForeignKey(
      this.RELATIONSHIP_TABLE,
      new TableForeignKey({
        columnNames: ['sourceDataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createForeignKey(
      this.RELATIONSHIP_TABLE,
      new TableForeignKey({
        columnNames: ['targetDataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      })
    );

    const hasColumnConfig = await queryRunner.hasColumn(
      this.REPORT_TABLE,
      this.COLUMN_CONFIG_COLUMN
    );
    if (!hasColumnConfig) {
      await queryRunner.addColumn(
        this.REPORT_TABLE,
        new TableColumn({
          name: this.COLUMN_CONFIG_COLUMN,
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumnConfig = await queryRunner.hasColumn(
      this.REPORT_TABLE,
      this.COLUMN_CONFIG_COLUMN
    );
    if (hasColumnConfig) {
      await queryRunner.dropColumn(this.REPORT_TABLE, this.COLUMN_CONFIG_COLUMN);
    }

    await softDropTable(queryRunner, this.RELATIONSHIP_TABLE);
  }
}
