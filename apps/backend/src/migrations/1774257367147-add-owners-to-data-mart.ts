import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOwnersToDataMart1774257367147 implements MigrationInterface {
  public readonly name = 'AddOwnersToDataMart1774257367147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasBusinessOwnerIds = await queryRunner.hasColumn('data_mart', 'businessOwnerIds');
    if (!hasBusinessOwnerIds) {
      await queryRunner.addColumn(
        'data_mart',
        new TableColumn({
          name: 'businessOwnerIds',
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }

    const hasTechnicalOwnerIds = await queryRunner.hasColumn('data_mart', 'technicalOwnerIds');
    if (!hasTechnicalOwnerIds) {
      await queryRunner.addColumn(
        'data_mart',
        new TableColumn({
          name: 'technicalOwnerIds',
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasBusinessOwnerIds = await queryRunner.hasColumn('data_mart', 'businessOwnerIds');
    if (hasBusinessOwnerIds) {
      await queryRunner.dropColumn('data_mart', 'businessOwnerIds');
    }

    const hasTechnicalOwnerIds = await queryRunner.hasColumn('data_mart', 'technicalOwnerIds');
    if (hasTechnicalOwnerIds) {
      await queryRunner.dropColumn('data_mart', 'technicalOwnerIds');
    }
  }
}
