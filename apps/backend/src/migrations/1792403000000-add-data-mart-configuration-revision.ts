import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDataMartConfigurationRevision1792403000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.addColumns('data_mart', [
      new TableColumn({ name: 'revision', type: 'int', default: 1 }),
      new TableColumn({ name: 'schemaInputRevision', type: 'int', isNullable: true }),
      new TableColumn({
        name: 'connectorPreparationId',
        type: 'varchar',
        length: '36',
        isNullable: true,
      }),
      new TableColumn({ name: 'connectorPreparedById', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'connectorPreparedRevision', type: 'int', isNullable: true }),
    ]);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.dropColumns('data_mart', [
      'connectorPreparationId',
      'connectorPreparedById',
      'connectorPreparedRevision',
      'schemaInputRevision',
    ]);
    await runner.dropColumn('data_mart', 'revision');
  }
}
