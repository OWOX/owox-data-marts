import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateInsightArtifactTable1770100000000 implements MigrationInterface {
  name = 'CreateInsightArtifactTable1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'insight_artifact',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'title', type: 'varchar', isNullable: false },
          { name: 'sql', type: 'text', isNullable: false },
          { name: 'validationStatus', type: 'varchar', isNullable: false, default: "'VALID'" },
          { name: 'validationError', type: 'text', isNullable: true },
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
      'insight_artifact',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );

    await queryRunner.createIndex(
      'insight_artifact',
      new TableIndex({
        name: 'idx_ins_art_dataMart',
        columnNames: ['dataMartId'],
      })
    );

    await queryRunner.createIndex(
      'insight_artifact',
      new TableIndex({
        name: 'idx_ins_art_dataMart_createdAt',
        columnNames: ['dataMartId', 'createdAt'],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'insight_artifact');
  }
}
