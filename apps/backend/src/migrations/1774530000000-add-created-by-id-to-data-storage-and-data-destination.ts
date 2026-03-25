import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCreatedByIdToDataStorageAndDataDestination1774530000000 implements MigrationInterface {
  public readonly name = 'AddCreatedByIdToDataStorageAndDataDestination1774530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasStorageColumn = await queryRunner.hasColumn('data_storage', 'createdById');
    if (!hasStorageColumn) {
      await queryRunner.addColumn(
        'data_storage',
        new TableColumn({
          name: 'createdById',
          type: 'varchar',
          isNullable: true,
          default: null,
        })
      );
    }

    const hasDestinationColumn = await queryRunner.hasColumn('data_destination', 'createdById');
    if (!hasDestinationColumn) {
      await queryRunner.addColumn(
        'data_destination',
        new TableColumn({
          name: 'createdById',
          type: 'varchar',
          isNullable: true,
          default: null,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasStorageColumn = await queryRunner.hasColumn('data_storage', 'createdById');
    if (hasStorageColumn) {
      await queryRunner.dropColumn('data_storage', 'createdById');
    }

    const hasDestinationColumn = await queryRunner.hasColumn('data_destination', 'createdById');
    if (hasDestinationColumn) {
      await queryRunner.dropColumn('data_destination', 'createdById');
    }
  }
}
