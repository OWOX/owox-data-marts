import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

const DOCUMENT = 'plugin_collection_document';
const USAGE = 'plugin_collection_usage';
const AUDIT = 'plugin_collection_audit_event';

export class CreatePluginCollectionTables1785931300000 implements MigrationInterface {
  public readonly name = 'CreatePluginCollectionTables1785931300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(DOCUMENT))) {
      await queryRunner.createTable(
        new Table({
          name: DOCUMENT,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'namespaceKey', type: 'varchar', length: '64' },
            { name: 'documentKey', type: 'varchar', length: '64' },
            { name: 'pluginId', type: 'varchar', length: '36' },
            { name: 'projectId', type: 'varchar', length: '255' },
            { name: 'scope', type: 'varchar', length: '16' },
            { name: 'memberId', type: 'varchar', length: '255', isNullable: true },
            { name: 'collectionName', type: 'varchar', length: '64' },
            { name: 'documentId', type: 'varchar', length: '200' },
            { name: 'parentType', type: 'varchar', length: '32', isNullable: true },
            { name: 'parentId', type: 'varchar', length: '255', isNullable: true },
            { name: 'document', type: 'json' },
            { name: 'documentSizeBytes', type: 'int', unsigned: true },
            { name: 'createdByUserId', type: 'varchar', length: '255' },
            { name: 'modifiedByUserId', type: 'varchar', length: '255' },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );
      await queryRunner.createIndices(DOCUMENT, [
        new TableIndex({
          name: 'UQ_plugin_collection_document_namespace_key',
          columnNames: ['namespaceKey', 'documentKey'],
          isUnique: true,
        }),
        new TableIndex({
          name: 'idx_plugin_collection_document_parent',
          columnNames: ['namespaceKey', 'parentId'],
        }),
      ]);
    }

    if (!(await queryRunner.hasTable(USAGE))) {
      await queryRunner.createTable(
        new Table({
          name: USAGE,
          columns: [
            { name: 'usageKey', type: 'varchar', length: '64', isPrimary: true },
            { name: 'level', type: 'varchar', length: '32' },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: true },
            { name: 'projectId', type: 'varchar', length: '255' },
            { name: 'namespaceKey', type: 'varchar', length: '64', isNullable: true },
            { name: 'documentCount', type: 'int', unsigned: true, default: 0 },
            { name: 'totalBytes', type: 'bigint', unsigned: true, default: 0 },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );
      await queryRunner.createIndex(
        USAGE,
        new TableIndex({
          name: 'idx_plugin_collection_usage_project',
          columnNames: ['projectId', 'level'],
        })
      );
    }

    if (!(await queryRunner.hasTable(AUDIT))) {
      await queryRunner.createTable(
        new Table({
          name: AUDIT,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36' },
            { name: 'projectId', type: 'varchar', length: '255' },
            { name: 'userId', type: 'varchar', length: '255' },
            { name: 'installationId', type: 'varchar', length: '36' },
            { name: 'collectionName', type: 'varchar', length: '64' },
            { name: 'documentId', type: 'varchar', length: '200', isNullable: true },
            { name: 'parentType', type: 'varchar', length: '32', isNullable: true },
            { name: 'parentId', type: 'varchar', length: '255', isNullable: true },
            { name: 'action', type: 'varchar', length: '16' },
            { name: 'outcome', type: 'varchar', length: '32' },
            { name: 'metadata', type: 'json', isNullable: true },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );
      await queryRunner.createIndices(AUDIT, [
        new TableIndex({
          name: 'idx_plugin_collection_audit_project_created',
          columnNames: ['projectId', 'createdAt'],
        }),
        new TableIndex({
          name: 'idx_plugin_collection_audit_plugin_project_created',
          columnNames: ['pluginId', 'projectId', 'createdAt'],
        }),
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(AUDIT)) await queryRunner.dropTable(AUDIT);
    if (await queryRunner.hasTable(USAGE)) await queryRunner.dropTable(USAGE);
    if (await queryRunner.hasTable(DOCUMENT)) await queryRunner.dropTable(DOCUMENT);
  }
}
