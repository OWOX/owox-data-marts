import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const CREDENTIAL = 'credential';
const CREDENTIAL_OWNER = 'credential_owners';
const CREDENTIAL_CONTEXT = 'credential_contexts';
const EXTERNAL_DEFINITION = 'credential_external_definition';
const DEFINITION_VERSION = 'credential_definition_version';
const CONSUMER_BINDING = 'credential_consumer_binding';

export class CreateReusableCredentialTables1787788800000 implements MigrationInterface {
  public readonly name = 'CreateReusableCredentialTables1787788800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(EXTERNAL_DEFINITION))) {
      await queryRunner.createTable(
        new Table({
          name: EXTERNAL_DEFINITION,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'githubRepoId', type: 'varchar', length: '20' },
            { name: 'repoOwner', type: 'varchar', length: '255' },
            { name: 'repoName', type: 'varchar', length: '255' },
            {
              name: 'currentVersionId',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            {
              name: 'currentCompatibilityLine',
              type: 'varchar',
              length: '32',
              isNullable: true,
            },
            { name: 'lastSyncSummary', type: 'json', isNullable: true },
            { name: 'nextSyncAt', type: 'datetime', isNullable: true },
            {
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'modifiedAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        })
      );
      await queryRunner.createIndex(
        EXTERNAL_DEFINITION,
        new TableIndex({
          name: 'UQ_credential_external_definition_repo',
          columnNames: ['githubRepoId'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        EXTERNAL_DEFINITION,
        new TableIndex({
          name: 'idx_credential_external_definition_next_sync',
          columnNames: ['nextSyncAt'],
        })
      );
    }

    if (!(await queryRunner.hasTable(DEFINITION_VERSION))) {
      await queryRunner.createTable(
        new Table({
          name: DEFINITION_VERSION,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'externalDefinitionId', type: 'varchar', length: '36' },
            { name: 'semver', type: 'varchar', length: '32' },
            { name: 'compatibilityLine', type: 'varchar', length: '32' },
            { name: 'commitSha', type: 'varchar', length: '40' },
            { name: 'githubReleaseId', type: 'varchar', length: '20' },
            { name: 'tagName', type: 'varchar', length: '255' },
            { name: 'contract', type: 'json' },
            {
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        })
      );
      await queryRunner.createIndex(
        DEFINITION_VERSION,
        new TableIndex({
          name: 'UQ_credential_definition_version_semver',
          columnNames: ['externalDefinitionId', 'semver'],
          isUnique: true,
        })
      );
      await queryRunner.createForeignKey(
        DEFINITION_VERSION,
        new TableForeignKey({
          columnNames: ['externalDefinitionId'],
          referencedTableName: EXTERNAL_DEFINITION,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(CREDENTIAL))) {
      await queryRunner.createTable(
        new Table({
          name: CREDENTIAL,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'projectId', type: 'varchar', length: '255' },
            { name: 'title', type: 'varchar', length: '255' },
            { name: 'definitionSource', type: 'varchar', length: '16' },
            { name: 'definitionId', type: 'varchar', length: '255' },
            {
              name: 'acceptedCompatibilityLine',
              type: 'varchar',
              length: '32',
              isNullable: true,
            },
            { name: 'secret', type: 'json' },
            { name: 'aiModelMappings', type: 'json', isNullable: true },
            { name: 'aiModelMappingModes', type: 'json', isNullable: true },
            { name: 'enabled', type: 'boolean', default: true },
            { name: 'availableForUse', type: 'boolean', default: true },
            {
              name: 'availableForMaintenance',
              type: 'boolean',
              default: false,
            },
            {
              name: 'createdById',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'modifiedAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            { name: 'deletedAt', type: 'datetime', isNullable: true },
          ],
        })
      );
      await queryRunner.createIndex(
        CREDENTIAL,
        new TableIndex({
          name: 'idx_credential_project_deleted',
          columnNames: ['projectId', 'deletedAt'],
        })
      );
      await queryRunner.createIndex(
        CREDENTIAL,
        new TableIndex({
          name: 'idx_credential_definition',
          columnNames: ['definitionSource', 'definitionId'],
        })
      );
    }

    if (!(await queryRunner.hasTable(CREDENTIAL_OWNER))) {
      await queryRunner.createTable(
        new Table({
          name: CREDENTIAL_OWNER,
          columns: [
            {
              name: 'credential_id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'user_id',
              type: 'varchar',
              length: '255',
              isPrimary: true,
            },
          ],
        })
      );
      await queryRunner.createForeignKey(
        CREDENTIAL_OWNER,
        new TableForeignKey({
          columnNames: ['credential_id'],
          referencedTableName: CREDENTIAL,
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(CREDENTIAL_CONTEXT))) {
      await queryRunner.createTable(
        new Table({
          name: CREDENTIAL_CONTEXT,
          columns: [
            {
              name: 'credential_id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
            {
              name: 'context_id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
            },
          ],
        })
      );
      await queryRunner.createIndex(
        CREDENTIAL_CONTEXT,
        new TableIndex({
          name: 'idx_credential_context_context',
          columnNames: ['context_id'],
        })
      );
      await queryRunner.createForeignKey(
        CREDENTIAL_CONTEXT,
        new TableForeignKey({
          columnNames: ['credential_id'],
          referencedTableName: CREDENTIAL,
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        })
      );
      await queryRunner.createForeignKey(
        CREDENTIAL_CONTEXT,
        new TableForeignKey({
          columnNames: ['context_id'],
          referencedTableName: 'context',
          referencedColumnNames: ['id'],
          onDelete: 'RESTRICT',
          onUpdate: 'NO ACTION',
        })
      );
    }

    if (!(await queryRunner.hasTable(CONSUMER_BINDING))) {
      await queryRunner.createTable(
        new Table({
          name: CONSUMER_BINDING,
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'projectId', type: 'varchar', length: '255' },
            { name: 'credentialId', type: 'varchar', length: '36' },
            { name: 'consumerType', type: 'varchar', length: '32' },
            { name: 'consumerId', type: 'varchar', length: '255' },
            { name: 'requirementKey', type: 'varchar', length: '255' },
            { name: 'requirementSnapshot', type: 'json' },
            { name: 'requirementRevision', type: 'varchar', length: '64' },
            {
              name: 'configuredById',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            { name: 'active', type: 'boolean', default: true },
            { name: 'lastUsedAt', type: 'datetime', isNullable: true },
            {
              name: 'createdAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'modifiedAt',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        })
      );
      await queryRunner.createIndex(
        CONSUMER_BINDING,
        new TableIndex({
          name: 'UQ_credential_consumer_requirement',
          columnNames: ['consumerType', 'consumerId', 'requirementKey'],
          isUnique: true,
        })
      );
      await queryRunner.createIndex(
        CONSUMER_BINDING,
        new TableIndex({
          name: 'idx_credential_binding_credential_active',
          columnNames: ['credentialId', 'active'],
        })
      );
      await queryRunner.createIndex(
        CONSUMER_BINDING,
        new TableIndex({
          name: 'idx_credential_binding_consumer',
          columnNames: ['consumerType', 'consumerId', 'active'],
        })
      );
      await queryRunner.createForeignKey(
        CONSUMER_BINDING,
        new TableForeignKey({
          columnNames: ['credentialId'],
          referencedTableName: CREDENTIAL,
          referencedColumnNames: ['id'],
          onDelete: 'NO ACTION',
          onUpdate: 'NO ACTION',
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, CONSUMER_BINDING);
    await softDropTable(queryRunner, CREDENTIAL_CONTEXT);
    await softDropTable(queryRunner, CREDENTIAL_OWNER);
    await softDropTable(queryRunner, CREDENTIAL);
    await softDropTable(queryRunner, DEFINITION_VERSION);
    await softDropTable(queryRunner, EXTERNAL_DEFINITION);
  }
}
