import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSchemaActualizedAtToDataMart1772909838000 implements MigrationInterface {
  public readonly name = 'AddSchemaActualizedAtToDataMart1772909838000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSchemaActualizedAt = await queryRunner.hasColumn('data_mart', 'schemaActualizedAt');
    if (hasSchemaActualizedAt) {
      return;
    }

    await queryRunner.addColumn(
      'data_mart',
      new TableColumn({
        name: 'schemaActualizedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasSchemaActualizedAt = await queryRunner.hasColumn('data_mart', 'schemaActualizedAt');
    if (!hasSchemaActualizedAt) {
      return;
    }

    await queryRunner.dropColumn('data_mart', 'schemaActualizedAt');
  }
}
