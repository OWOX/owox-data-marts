import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOutputToInsightTable1763465015992 implements MigrationInterface {
  private readonly TABLE_NAME = 'insight';
  public readonly name = 'AddOutputToInsightTable1763465015992';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'output',
        type: 'text',
        isNullable: true,
        default: null,
      })
    );
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'outputUpdatedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'lastManualDataMartRunId',
        type: 'varchar',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.TABLE_NAME, 'lastManualDataMartRunId');
    await queryRunner.dropColumn(this.TABLE_NAME, 'outputUpdatedAt');
    await queryRunner.dropColumn(this.TABLE_NAME, 'output');
  }
}
