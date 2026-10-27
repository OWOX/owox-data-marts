import { castError } from '@owox/internal-helpers';
import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { requirementRevision } from '../data-marts/credentials/services/credential-requirement-revision';
import type { DataStorageType } from '../data-marts/data-storage-types/enums/data-storage-type.enum';
import {
  DEFAULT_BIGQUERY_SCOPES,
  scopeList,
} from '../data-marts/services/google-oauth/google-oauth-scopes';
import { UNCONVERTED_STORAGES_SQL } from '../data-marts/services/storage-credential-conversion/legacy-storage-credential-sql';
import {
  planStorageCredentialConversion,
  type PlannedCredential,
} from '../data-marts/services/storage-credential-conversion/storage-credential-conversion-plan';

const logger = createLogger('ConvertStorageCredentials');

const UNCONVERTED = `(${UNCONVERTED_STORAGES_SQL}) unconverted`;

interface StorageRow {
  id: string;
  projectId: string;
  title: string | null;
  type: DataStorageType;
  createdAt: Date | string;
  keyType: string;
  keyCredentials: unknown;
  keyIdentity: unknown;
}

/** Turns the old Storage key rows into Credentials and binds each unbound Storage to its own. */
export class ConvertStorageCredentials1792600000000 implements MigrationInterface {
  public readonly name = 'ConvertStorageCredentials1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DDL of an earlier migration in this run commits the runner's transaction on MySQL; reopen one.
    if (
      queryRunner.isTransactionActive &&
      ['mysql', 'mariadb'].includes(queryRunner.connection.options.type)
    ) {
      await queryRunner.query('START TRANSACTION');
    }
    const rows: StorageRow[] = await queryRunner.query(`
      SELECT storage.id AS id, storage.projectId AS projectId, storage.title AS title,
        storage.type AS type, storage.createdAt AS createdAt, oldKey.type AS keyType,
        oldKey.credentials AS keyCredentials, oldKey.identity AS keyIdentity
      FROM ${UNCONVERTED}
      INNER JOIN data_storage storage ON storage.id = unconverted.id
      INNER JOIN data_storage_credentials oldKey ON oldKey.id = storage.credentialId`);
    if (rows.length === 0) return;
    const owners = await linkedIds(queryRunner, 'storage_owners', 'user_id');
    // A Storage the legacy sync moved keeps its old project's Contexts; they do not apply here.
    const contexts = await linkedIds(
      queryRunner,
      'storage_contexts',
      'context_id',
      'INNER JOIN context ctx ON ctx.id = link.context_id' +
        ' AND ctx.projectId = unconverted.projectId AND ctx.deletedAt IS NULL'
    );

    // Everything is derived before the first write; a failing write aborts the migration.
    const plan = planStorageCredentialConversion(
      rows.map(row => ({
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        type: row.type,
        createdAt: new Date(row.createdAt),
        ownerIds: owners.get(row.id) ?? [],
        contextIds: contexts.get(row.id) ?? [],
        key: { type: row.keyType, credentials: row.keyCredentials, identity: row.keyIdentity },
      })),
      {
        googleStorageClientId: process.env.OAUTH_GOOGLE_STORAGE_CLIENT_ID || undefined,
        bigQueryScopes: storageOAuthScopes(),
      }
    );
    for (const { storageId, reason } of plan.skipped) {
      logger.warn(`Storage ${storageId} keeps its old key: ${reason}`);
    }
    for (const storageId of plan.lackingScopes) {
      logger.warn(
        `Storage ${storageId} stops until its Credential is reconnected: its Google grant lacks a configured BigQuery scope`
      );
    }
    try {
      for (const credential of plan.credentials) {
        await insertCredential(queryRunner, credential);
      }
    } catch (error) {
      // The message only: a failed write's error carries its parameters, the secret among them.
      throw new Error(`Storage keys were not converted: ${castError(error).message}`);
    }
    logger.log(
      `Converted the keys of ${rows.length - plan.skipped.length} Storages into ${plan.credentials.length} Credentials`
    );
  }

  public async down(): Promise<void> {
    // Credentials and bindings stay: release N-1 never reads them, and up() skips bound Storages.
  }
}

/** The owner or Context ids of each unconverted Storage. */
async function linkedIds(
  queryRunner: QueryRunner,
  table: 'storage_owners' | 'storage_contexts',
  column: 'user_id' | 'context_id',
  join = ''
): Promise<Map<string, string[]>> {
  const rows: { storageId: string; linkedId: string }[] = await queryRunner.query(`
    SELECT link.storage_id AS storageId, link.${column} AS linkedId
    FROM ${table} link
    INNER JOIN ${UNCONVERTED} ON unconverted.id = link.storage_id
    ${join}`);
  const ids = new Map<string, string[]>();
  for (const { storageId, linkedId } of rows) {
    ids.set(storageId, [...(ids.get(storageId) ?? []), linkedId]);
  }
  return ids;
}

/** Null while sign-in is off; twin of GoogleOAuthConfigService.isStorageConfigured. */
function storageOAuthScopes(): string[] | null {
  const env = process.env;
  const configured =
    env.OAUTH_GOOGLE_STORAGE_CLIENT_ID &&
    env.OAUTH_GOOGLE_STORAGE_CLIENT_SECRET &&
    env.OAUTH_GOOGLE_REDIRECT_URI &&
    env.OAUTH_GOOGLE_JWT_SECRET;
  return configured
    ? (scopeList(env.OAUTH_GOOGLE_BIGQUERY_SCOPE) ?? [...DEFAULT_BIGQUERY_SCOPES])
    : null;
}

async function insertCredential(
  queryRunner: QueryRunner,
  credential: PlannedCredential
): Promise<void> {
  const credentialId = randomUUID();
  // Not shared: Credential sharing ignores roles, so sharing would hand the key to Business Users.
  await queryRunner.query(
    `INSERT INTO credential (id, projectId, title, definitionSource, definitionId, secret,
      publicMetadata, enabled, availableForUse, availableForMaintenance, validationState,
      createdAt, modifiedAt)
    VALUES (?, ?, ?, 'builtin', ?, ?, ?, 1, 0, 0, 'unknown', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      credentialId,
      credential.projectId,
      credential.title,
      credential.definitionId,
      JSON.stringify(credential.secret),
      credential.publicMetadata && JSON.stringify(credential.publicMetadata),
    ]
  );
  for (const userId of credential.ownerIds) {
    await queryRunner.query(
      'INSERT INTO credential_owners (credential_id, user_id) VALUES (?, ?)',
      [credentialId, userId]
    );
  }
  for (const contextId of credential.contextIds) {
    await queryRunner.query(
      'INSERT INTO credential_contexts (credential_id, context_id) VALUES (?, ?)',
      [credentialId, contextId]
    );
  }
  for (const { storageId, requirement } of credential.bindings) {
    await queryRunner.query(
      `INSERT INTO credential_consumer_binding (id, projectId, credentialId, consumerType,
        consumerId, requirementKey, requirementSnapshot, requirementRevision, configuredById,
        active, createdAt, modifiedAt)
      VALUES (?, ?, ?, 'storage', ?, 'storage', ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        credential.projectId,
        credentialId,
        storageId,
        JSON.stringify(requirement),
        requirementRevision(requirement),
      ]
    );
  }
}
