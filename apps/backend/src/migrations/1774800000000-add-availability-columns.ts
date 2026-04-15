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
        default: false,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    ]);

    // Set existing records to true (backward compat: all entities were visible before Permissions Model)
    await queryRunner.query(
      `UPDATE data_mart SET availableForReporting = 1, availableForMaintenance = 1`
    );

    // DataStorage: availableForUse + availableForMaintenance
    await queryRunner.addColumns('data_storage', [
      new TableColumn({
        name: 'availableForUse',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    ]);

    await queryRunner.query(
      `UPDATE data_storage SET availableForUse = 1, availableForMaintenance = 1`
    );

    // DataDestination: availableForUse + availableForMaintenance
    await queryRunner.addColumns('data_destination', [
      new TableColumn({
        name: 'availableForUse',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
      new TableColumn({
        name: 'availableForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: false,
      }),
    ]);

    await queryRunner.query(
      `UPDATE data_destination SET availableForUse = 1, availableForMaintenance = 1`
    );
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
