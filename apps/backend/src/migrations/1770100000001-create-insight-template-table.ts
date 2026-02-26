import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateInsightTemplateTable1770100000001 implements MigrationInterface {
  name = 'CreateInsightTemplateTable1770100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'insight_template',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'template', type: 'text', isNullable: true },
          { name: 'lastRenderedTemplate', type: 'text', isNullable: true },
          { name: 'lastRenderedTemplateUpdatedAt', type: 'datetime', isNullable: true },
          { name: 'lastManualDataMartRunId', type: 'varchar', isNullable: true },
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
      'insight_template',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createIndex(
      'insight_template',
      new TableIndex({
        name: 'idx_ins_tpl_dataMart',
        columnNames: ['dataMartId'],
      })
    );

    await queryRunner.createIndex(
      'insight_template',
      new TableIndex({
        name: 'idx_ins_tpl_dataMart_createdAt',
        columnNames: ['dataMartId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'insight_template');
  }
}
