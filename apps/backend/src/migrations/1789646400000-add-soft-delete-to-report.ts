import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSoftDeleteToReport1789646400000 implements MigrationInterface {
  public readonly name = 'AddSoftDeleteToReport1789646400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'report',
      new TableColumn({ name: 'deletedAt', type: 'datetime', isNullable: true })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('report', 'deletedAt');
  }
}
