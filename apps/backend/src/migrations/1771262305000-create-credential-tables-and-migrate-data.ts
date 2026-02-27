import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * Creates unified credential tables for data storage and data destination,
 * migrates existing inline credentials and OAuth credentials into them,
 * and adds credentialId FK columns to parent tables.
 *
 * Replaces the old storage_oauth_credentials / destination_oauth_credentials
 * tables and data_storage.oauthCredentialId column with a unified approach
 * where ALL credential types are stored in dedicated tables.
 */
export class CreateCredentialTablesAndMigrateData1771262305000 implements MigrationInterface {
  name = 'CreateCredentialTablesAndMigrateData1771262305000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create data_storage_credentials table (and its indexes) if it doesn't already exist
    if (!(await queryRunner.hasTable('data_storage_credentials'))) {
      await queryRunner.createTable(
        new Table({
          name: 'data_storage_credentials',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
            {
              name: 'createdById',
              type: 'varchar',
              length: '255',
              isNullable: true,
              default: null,
            },
            { name: 'type', type: 'varchar', length: '50', isNullable: false },
            { name: 'credentials', type: 'json', isNullable: false },
            { name: 'identity', type: 'json', isNullable: true, default: null },
            { name: 'expiresAt', type: 'datetime', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'deletedAt', type: 'datetime', isNullable: true, default: null },
          ],
        })
      );
      // Indexes on data_storage_credentials
      await queryRunner.createIndex(
        'data_storage_credentials',
        new TableIndex({
          name: 'IDX_data_storage_credentials_projectId',
          columnNames: ['projectId'],
        })
      );
      await queryRunner.createIndex(
        'data_storage_credentials',
        new TableIndex({ name: 'IDX_data_storage_credentials_type', columnNames: ['type'] })
      );
      await queryRunner.createIndex(
        'data_storage_credentials',
        new TableIndex({
          name: 'IDX_data_storage_credentials_projectId_type',
          columnNames: ['projectId', 'type'],
        })
      );
    }

    // 2. Create data_destination_credentials table (and its indexes) if it doesn't already exist
    if (!(await queryRunner.hasTable('data_destination_credentials'))) {
      await queryRunner.createTable(
        new Table({
          name: 'data_destination_credentials',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'projectId', type: 'varchar', length: '255', isNullable: false },
            {
              name: 'createdById',
              type: 'varchar',
              length: '255',
              isNullable: true,
              default: null,
            },
            { name: 'type', type: 'varchar', length: '50', isNullable: false },
            { name: 'credentials', type: 'json', isNullable: false },
            { name: 'identity', type: 'json', isNullable: true, default: null },
            { name: 'expiresAt', type: 'datetime', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'deletedAt', type: 'datetime', isNullable: true, default: null },
          ],
        })
      );
      // Indexes on data_destination_credentials
      await queryRunner.createIndex(
        'data_destination_credentials',
        new TableIndex({
          name: 'IDX_data_destination_credentials_projectId',
          columnNames: ['projectId'],
        })
      );
      await queryRunner.createIndex(
        'data_destination_credentials',
        new TableIndex({ name: 'IDX_data_destination_credentials_type', columnNames: ['type'] })
      );
      await queryRunner.createIndex(
        'data_destination_credentials',
        new TableIndex({
          name: 'IDX_data_destination_credentials_projectId_type',
          columnNames: ['projectId', 'type'],
        })
      );
    }

    // 5. Add credentialId column to data_storage (if it doesn't already exist)
    if (!(await queryRunner.hasColumn('data_storage', 'credentialId'))) {
      await queryRunner.addColumn(
        'data_storage',
        new TableColumn({
          name: 'credentialId',
          type: 'varchar',
          length: '36',
          isNullable: true,
          default: null,
        })
      );
      await queryRunner.createIndex(
        'data_storage',
        new TableIndex({ name: 'IDX_data_storage_credentialId', columnNames: ['credentialId'] })
      );
    }

    // 6. Add credentialId column to data_destination (if it doesn't already exist)
    if (!(await queryRunner.hasColumn('data_destination', 'credentialId'))) {
      await queryRunner.addColumn(
        'data_destination',
        new TableColumn({
          name: 'credentialId',
          type: 'varchar',
          length: '36',
          isNullable: true,
          default: null,
        })
      );
      await queryRunner.createIndex(
        'data_destination',
        new TableIndex({ name: 'IDX_data_destination_credentialId', columnNames: ['credentialId'] })
      );
    }

    // 7. Migrate data_storage.credentials → data_storage_credentials
    await this.migrateStorageCredentials(queryRunner);

    // 8. Migrate data_destination.credentials → data_destination_credentials
    await this.migrateDestinationCredentials(queryRunner);

    // 9. Make data_destination.credentials nullable (now redundant — credentialId is source of truth)
    await queryRunner.changeColumn(
      'data_destination',
      'credentials',
      new TableColumn({ name: 'credentials', type: 'json', isNullable: true })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Restore inline credentials from credential tables back to main entities
    await queryRunner.query(`
      UPDATE data_storage
      SET credentials = (
        SELECT sc.credentials
        FROM data_storage_credentials sc
        WHERE sc.id = data_storage.credentialId
      )
      WHERE credentialId IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE data_destination
      SET credentials = (
        SELECT dc.credentials
        FROM data_destination_credentials dc
        WHERE dc.id = data_destination.credentialId
      )
      WHERE credentialId IS NOT NULL
    `);

    // Records created after migration have credentials = NULL — set a placeholder so NOT NULL can be restored
    await queryRunner.query(
      `UPDATE data_destination SET credentials = '{}' WHERE credentials IS NULL`
    );

    // 2. Restore data_destination.credentials to NOT NULL
    await queryRunner.changeColumn(
      'data_destination',
      'credentials',
      new TableColumn({ name: 'credentials', type: 'json', isNullable: false })
    );

    // 3. Drop credentialId column from data_destination (index is removed automatically on SQLite recreate; on MySQL drop first)
    if (await queryRunner.hasColumn('data_destination', 'credentialId')) {
      try {
        await queryRunner.dropIndex('data_destination', 'IDX_data_destination_credentialId');
      } catch {
        // index may already be gone (SQLite table recreate in step 2)
      }
      await queryRunner.dropColumn('data_destination', 'credentialId');
    }

    // 4. Drop credentialId column from data_storage
    if (await queryRunner.hasColumn('data_storage', 'credentialId')) {
      try {
        await queryRunner.dropIndex('data_storage', 'IDX_data_storage_credentialId');
      } catch {
        // index may already be gone
      }
      await queryRunner.dropColumn('data_storage', 'credentialId');
    }

    // 5. Drop credential tables
    if (await queryRunner.hasTable('data_destination_credentials')) {
      await queryRunner.dropTable('data_destination_credentials');
    }
    if (await queryRunner.hasTable('data_storage_credentials')) {
      await queryRunner.dropTable('data_storage_credentials');
    }
  }

  private async migrateStorageCredentials(queryRunner: QueryRunner): Promise<void> {
    const storages = (await queryRunner.query(
      `SELECT id, projectId, type, credentials FROM data_storage WHERE credentials IS NOT NULL`
    )) as Array<{ id: string; projectId: string; type: string; credentials: string }>;

    if (storages.length === 0) return;

    // Compute all credential rows in memory, then bulk-insert in a single query
    type CredRow = [string, string, string, string, string | null];
    const insertRows: CredRow[] = [];
    const idMapping: Array<{ newId: string; storageId: string }> = [];

    for (const storage of storages) {
      const creds =
        typeof storage.credentials === 'string'
          ? (JSON.parse(storage.credentials) as Record<string, unknown>)
          : (storage.credentials as Record<string, unknown>);

      const credType = this.resolveStorageCredentialType(storage.type, creds);
      const identity = this.extractStorageIdentity(credType, creds);
      const newId = randomUUID();

      insertRows.push([
        newId,
        storage.projectId,
        credType,
        JSON.stringify(creds),
        identity ? JSON.stringify(identity) : null,
      ]);
      idMapping.push({ newId, storageId: storage.id });
    }

    // Single bulk INSERT for all credential rows
    const now = new Date().toISOString();
    const placeholders = insertRows.map(() => `(?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL)`).join(',');
    const flatParams = insertRows.flatMap(row => [...row, now, now]);
    await queryRunner.query(
      `INSERT INTO data_storage_credentials (id, projectId, createdById, type, credentials, identity, expiresAt, createdAt, modifiedAt, deletedAt) VALUES ${placeholders}`,
      flatParams
    );

    for (const { newId, storageId } of idMapping) {
      await queryRunner.query(`UPDATE data_storage SET credentialId = ? WHERE id = ?`, [
        newId,
        storageId,
      ]);
    }
  }

  private async migrateDestinationCredentials(queryRunner: QueryRunner): Promise<void> {
    const destinations = (await queryRunner.query(
      `SELECT id, projectId, credentials FROM data_destination WHERE credentials IS NOT NULL`
    )) as Array<{ id: string; projectId: string; credentials: string }>;

    if (destinations.length === 0) return;

    type CredRow = [string, string, string, string, string | null];
    const insertRows: CredRow[] = [];
    const idMapping: Array<{ newId: string; destId: string }> = [];

    for (const dest of destinations) {
      const creds =
        typeof dest.credentials === 'string'
          ? (JSON.parse(dest.credentials) as Record<string, unknown>)
          : (dest.credentials as Record<string, unknown>);

      const credType = this.resolveDestinationCredentialType(creds);
      const identity = this.extractDestinationIdentity(credType, creds);
      const newId = randomUUID();

      insertRows.push([
        newId,
        dest.projectId,
        credType,
        JSON.stringify(creds),
        identity ? JSON.stringify(identity) : null,
      ]);
      idMapping.push({ newId, destId: dest.id });
    }

    const now = new Date().toISOString();
    const placeholders = insertRows.map(() => `(?, ?, NULL, ?, ?, ?, NULL, ?, ?, NULL)`).join(',');
    const flatParams = insertRows.flatMap(row => [...row, now, now]);
    await queryRunner.query(
      `INSERT INTO data_destination_credentials (id, projectId, createdById, type, credentials, identity, expiresAt, createdAt, modifiedAt, deletedAt) VALUES ${placeholders}`,
      flatParams
    );

    for (const { newId, destId } of idMapping) {
      await queryRunner.query(`UPDATE data_destination SET credentialId = ? WHERE id = ?`, [
        newId,
        destId,
      ]);
    }
  }

  private resolveStorageCredentialType(
    storageType: string,
    creds: Record<string, unknown>
  ): string {
    switch (storageType) {
      case 'GOOGLE_BIGQUERY':
      case 'LEGACY_GOOGLE_BIGQUERY':
        return 'google_service_account';
      case 'AWS_ATHENA':
      case 'AWS_REDSHIFT':
        return 'aws_iam';
      case 'SNOWFLAKE':
        return creds.authMethod === 'KEY_PAIR' ? 'snowflake_key_pair' : 'snowflake_password';
      case 'DATABRICKS':
        return 'databricks_pat';
      default:
        return 'google_service_account';
    }
  }

  private resolveDestinationCredentialType(creds: Record<string, unknown>): string {
    switch (creds.type) {
      case 'google-sheets-credentials':
        return 'google_service_account';
      case 'looker-studio-credentials':
        return 'looker_studio';
      case 'email-credentials':
        return 'email';
      default:
        return 'google_service_account';
    }
  }

  private extractStorageIdentity(
    credType: string,
    creds: Record<string, unknown>
  ): Record<string, unknown> | null {
    switch (credType) {
      case 'google_service_account':
        return creds.client_email ? { clientEmail: creds.client_email } : null;
      case 'snowflake_password':
      case 'snowflake_key_pair':
        return creds.username ? { username: creds.username } : null;
      case 'aws_iam':
        return creds.accessKeyId ? { accessKeyId: creds.accessKeyId } : null;
      default:
        return null;
    }
  }

  private extractDestinationIdentity(
    credType: string,
    creds: Record<string, unknown>
  ): Record<string, unknown> | null {
    if (credType === 'google_service_account') {
      const saKey = creds.serviceAccountKey as Record<string, unknown> | undefined;
      return saKey?.client_email ? { clientEmail: saKey.client_email } : null;
    }
    return null;
  }
}
