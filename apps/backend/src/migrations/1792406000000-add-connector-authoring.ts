import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';
import { softDropTable } from './migration-utils';

export class AddConnectorAuthoring1792406000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn('connector_definition', 'revision')))
      await runner.addColumn(
        'connector_definition',
        new TableColumn({ name: 'revision', type: 'int', default: 1 })
      );
    for (const table of [
      new Table({
        name: 'connector_reference_guard',
        columns: [
          { name: 'projectId', type: 'varchar', isPrimary: true },
          { name: 'generation', type: 'int', default: 0 },
        ],
      }),
      new Table({
        name: 'connector_authoring_test_run',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          ...['projectId', 'userId', 'connectorId', 'state'].map(name => ({
            name,
            type: 'varchar',
          })),
          { name: 'revision', type: 'int' },
          { name: 'version', type: 'int' },
          { name: 'rowCount', type: 'int', isNullable: true },
        ],
      }),
      new Table({
        name: 'connector_protected_values',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          ...['projectId', 'connectorId', 'userId', 'purpose'].map(name => ({
            name,
            type: 'varchar',
          })),
          { name: 'values', type: 'json' },
        ],
      }),
      new Table({
        name: 'connector_authoring_preparation',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          ...[
            'projectId',
            'connectorId',
            'userId',
            'purpose',
            'sourceDigest',
            'protectedValuesId',
          ].map(name => ({ name, type: 'varchar' })),
          { name: 'revision', type: 'int' },
          { name: 'version', type: 'int' },
          { name: 'safeManifest', type: 'json' },
          { name: 'expiresAt', type: 'datetime' },
          { name: 'revokedAt', type: 'datetime', isNullable: true },
        ],
      }),
    ])
      if (!(await runner.hasTable(table.name))) await runner.createTable(table);
  }
  async down(runner: QueryRunner): Promise<void> {
    for (const name of [
      'connector_authoring_test_run',
      'connector_authoring_preparation',
      'connector_protected_values',
      'connector_reference_guard',
    ])
      await softDropTable(runner, name);
    await runner.dropColumn('connector_definition', 'revision');
  }
}
