import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAvailabilityColumns1774800000000 implements MigrationInterface {
  public readonly name = 'AddAvailabilityColumns1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DataMart: availableForReporting + availableForMaintenance
    await queryRunner.addColumns('data_mart', [
      new TableColumn({
        name: 'availableForReporting',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);

    // DataStorage: availableForUse + availableForMaintenance
    await queryRunner.addColumns('data_storage', [
      new TableColumn({
        name: 'availableForUse',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);

    // DataDestination: availableForUse + availableForMaintenance
    await queryRunner.addColumns('data_destination', [
      new TableColumn({
        name: 'availableForUse',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('data_destination', 'availableForMaintenance');
    await queryRunner.dropColumn('data_destination', 'availableForUse');
    await queryRunner.dropColumn('data_storage', 'availableForMaintenance');
    await queryRunner.dropColumn('data_storage', 'availableForUse');
    await queryRunner.dropColumn('data_mart', 'availableForMaintenance');
    await queryRunner.dropColumn('data_mart', 'availableForReporting');
  }
}
