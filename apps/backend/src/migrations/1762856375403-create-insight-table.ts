import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateInsightTable1762856375403 implements MigrationInterface {
  name = 'CreateInsightTable1762856375403';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'insight',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'template', type: 'text', isNullable: true },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'deletedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'insight',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createIndex(
      'insight',
      new TableIndex({
        name: 'idx_ins_dataMart',
        columnNames: ['dataMartId'],
      })
    );

    await queryRunner.createIndex(
      'insight',
      new TableIndex({
        name: 'idx_ins_dataMart_createdAt',
        columnNames: ['dataMartId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'insight');
  }
}
