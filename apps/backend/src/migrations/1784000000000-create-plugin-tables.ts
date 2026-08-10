import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const PLUGIN = 'plugin';
const PLUGIN_VERSION = 'plugin_version';
const PLUGIN_PUBLICATION = 'plugin_publication';
const PLUGIN_PUBLICATION_PROJECT = 'plugin_publication_project';
const PLUGIN_INSTALLATION = 'plugin_installation';
const PLUGIN_AUDIT_EVENT = 'plugin_audit_event';

/**
 * Plugin host schema.
 *
 * Foreign keys point only at this module's own tables. projectId and userId are plain
 * columns with no constraint: those records live in the IDP, and the spec requires
 * that removing a member or recoverably deleting a project mutates neither
 * publications nor installations. Where FKs do exist they are NO ACTION -- nothing in
 * this module is ever hard-deleted, so a cascade would be a bug, not an optimisation.
 */
export class CreatePluginTables1784000000000 implements MigrationInterface {
  public readonly name = 'CreatePluginTables1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(PLUGIN))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'githubRepoId', type: 'varchar', length: '20', isNullable: false },
            { name: 'repoOwner', type: 'varchar', length: '255', isNullable: false },
            { name: 'repoName', type: 'varchar', length: '255', isNullable: false },
            { name: 'repoHtmlUrl', type: 'varchar', length: '2048', isNullable: false },
            { name: 'isPrivateRepo', type: 'boolean', isNullable: false, default: false },
            { name: 'currentVersionId', type: 'varchar', length: '36', isNullable: true },
            { name: 'suspendedAt', type: 'datetime', isNullable: true, default: null },
            { name: 'suspendedByApiKeyId', type: 'varchar', length: '255', isNullable: true },
            { name: 'suspensionNote', type: 'text', isNullable: true },
            { name: 'lastSyncAt', type: 'datetime', isNullable: true, default: null },
            { name: 'nextUpdateCheckAt', type: 'datetime', isNullable: true, default: null },
            { name: 'lastSyncReport', type: 'json', isNullable: true },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN,
        new TableIndex({
          name: 'UQ_plugin_github_repo_id',
          columnNames: ['githubRepoId'],
          isUnique: true,
        })
      );
    }

    if (!(await queryRunner.hasTable(PLUGIN_VERSION))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN_VERSION,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
            { name: 'semver', type: 'varchar', length: '32', isNullable: false },
            { name: 'commitSha', type: 'varchar', length: '40', isNullable: false },
            { name: 'githubReleaseId', type: 'varchar', length: '20', isNullable: false },
            { name: 'tagName', type: 'varchar', length: '255', isNullable: false },
            { name: 'displayName', type: 'varchar', length: '255', isNullable: false },
            { name: 'description', type: 'text', isNullable: false },
            { name: 'deliveryType', type: 'varchar', length: '32', isNullable: false },
            { name: 'deliveryUrl', type: 'varchar', length: '2048', isNullable: false },
            { name: 'releasePublishedAt', type: 'datetime', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN_VERSION,
        new TableIndex({
          name: 'UQ_plugin_version_semver',
          columnNames: ['pluginId', 'semver'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        PLUGIN_VERSION,
        new TableIndex({ name: 'idx_plugin_version_plugin', columnNames: ['pluginId'] })
      );
      await queryRunner.createForeignKey(
        PLUGIN_VERSION,
        new TableForeignKey({
          columnNames: ['pluginId'],
          referencedTableName: PLUGIN,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(PLUGIN_PUBLICATION))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN_PUBLICATION,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
            { name: 'scope', type: 'varchar', length: '16', isNullable: false },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: true },
            { name: 'userId', type: 'varchar', length: '255', isNullable: true },
            { name: 'allProjects', type: 'boolean', isNullable: false, default: false },
            { name: 'isActive', type: 'boolean', isNullable: false, default: true },
            { name: 'uniquenessKey', type: 'varchar', length: '512', isNullable: false },
            { name: 'publishedAt', type: 'datetime', isNullable: true, default: null },
            { name: 'unpublishedAt', type: 'datetime', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN_PUBLICATION,
        new TableIndex({
          name: 'UQ_plugin_publication_key',
          columnNames: ['uniquenessKey'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        PLUGIN_PUBLICATION,
        new TableIndex({
          name: 'idx_plugin_publication_lookup',
          columnNames: ['pluginId', 'scope', 'isActive'],
        })
      );
      await queryRunner.createForeignKey(
        PLUGIN_PUBLICATION,
        new TableForeignKey({
          columnNames: ['pluginId'],
          referencedTableName: PLUGIN,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(PLUGIN_PUBLICATION_PROJECT))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN_PUBLICATION_PROJECT,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'publicationId', type: 'varchar', length: '36', isNullable: false },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
            { name: 'isActive', type: 'boolean', isNullable: false, default: true },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN_PUBLICATION_PROJECT,
        new TableIndex({
          name: 'UQ_plugin_publication_project',
          columnNames: ['publicationId', 'projectId'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        PLUGIN_PUBLICATION_PROJECT,
        new TableIndex({
          name: 'idx_plugin_publication_project_project',
          columnNames: ['projectId', 'isActive'],
        })
      );
      await queryRunner.createForeignKey(
        PLUGIN_PUBLICATION_PROJECT,
        new TableForeignKey({
          columnNames: ['publicationId'],
          referencedTableName: PLUGIN_PUBLICATION,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(PLUGIN_INSTALLATION))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN_INSTALLATION,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
            { name: 'userId', type: 'varchar', length: '255', isNullable: false },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'installedAt', type: 'datetime', isNullable: false },
            { name: 'uninstalledAt', type: 'datetime', isNullable: true, default: null },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN_INSTALLATION,
        new TableIndex({
          name: 'UQ_plugin_installation',
          columnNames: ['pluginId', 'projectId', 'userId'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        PLUGIN_INSTALLATION,
        new TableIndex({
          name: 'idx_plugin_installation_member',
          columnNames: ['projectId', 'userId', 'uninstalledAt'],
        })
      );
      await queryRunner.createForeignKey(
        PLUGIN_INSTALLATION,
        new TableForeignKey({
          columnNames: ['pluginId'],
          referencedTableName: PLUGIN,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(PLUGIN_AUDIT_EVENT))) {
      await queryRunner.createTable(
        new Table({
          name: PLUGIN_AUDIT_EVENT,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'pluginId', type: 'varchar', length: '36', isNullable: false },
            { name: 'action', type: 'varchar', length: '64', isNullable: false },
            { name: 'authorityScope', type: 'varchar', length: '16', isNullable: false },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: true },
            { name: 'userId', type: 'varchar', length: '255', isNullable: true },
            { name: 'apiKeyId', type: 'varchar', length: '255', isNullable: true },
            { name: 'beforeState', type: 'json', isNullable: true },
            { name: 'afterState', type: 'json', isNullable: true },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        })
      );

      await queryRunner.createIndex(
        PLUGIN_AUDIT_EVENT,
        new TableIndex({
          name: 'idx_plugin_audit_plugin',
          columnNames: ['pluginId', 'createdAt'],
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse dependency order so the foreign keys go before what they reference.
    for (const table of [
      PLUGIN_AUDIT_EVENT,
      PLUGIN_INSTALLATION,
      PLUGIN_PUBLICATION_PROJECT,
      PLUGIN_PUBLICATION,
      PLUGIN_VERSION,
      PLUGIN,
    ]) {
      if (await queryRunner.hasTable(table)) {
        await softDropTable(queryRunner, table);
      }
    }
  }
}
