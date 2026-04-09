import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSharingColumns1774800000000 implements MigrationInterface {
  public readonly name = 'AddSharingColumns1774800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DataMart: sharedForReporting + sharedForMaintenance
    await queryRunner.addColumns('data_mart', [
      new TableColumn({
        name: 'sharedForReporting',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'sharedForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);

    // DataStorage: sharedForUse + sharedForMaintenance
    await queryRunner.addColumns('data_storage', [
      new TableColumn({
        name: 'sharedForUse',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'sharedForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);

    // DataDestination: sharedForUse + sharedForMaintenance
    await queryRunner.addColumns('data_destination', [
      new TableColumn({
        name: 'sharedForUse',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
      new TableColumn({
        name: 'sharedForMaintenance',
        type: 'boolean',
        isNullable: false,
        default: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('data_destination', 'sharedForMaintenance');
    await queryRunner.dropColumn('data_destination', 'sharedForUse');
    await queryRunner.dropColumn('data_storage', 'sharedForMaintenance');
    await queryRunner.dropColumn('data_storage', 'sharedForUse');
    await queryRunner.dropColumn('data_mart', 'sharedForMaintenance');
    await queryRunner.dropColumn('data_mart', 'sharedForReporting');
  }
}
