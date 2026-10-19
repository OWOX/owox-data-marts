import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddProjectSettingsRevision1792400000000 implements MigrationInterface {
  name = 'AddProjectSettingsRevision1792400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'project_settings',
      new TableColumn({ name: 'revision', type: 'int', default: 0 })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('project_settings', 'revision');
  }
}
