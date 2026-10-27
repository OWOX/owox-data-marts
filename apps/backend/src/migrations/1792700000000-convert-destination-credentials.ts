import { castError } from '@owox/internal-helpers';
import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { requirementRevision } from '../data-marts/credentials/services/credential-requirement-revision';
import { DESTINATION_BINDING } from '../data-marts/data-destination-types/destination-credential-state';
import type { DataDestinationType } from '../data-marts/data-destination-types/enums/data-destination-type.enum';
import {
  planDestinationCredentialConversion,
  type DestinationConversionOptions,
  type PlannedDestinationCredential,
} from '../data-marts/services/destination-credential-conversion/destination-credential-conversion-plan';
import { UNCONVERTED_DESTINATIONS_SQL } from '../data-marts/services/destination-credential-conversion/legacy-destination-credential-sql';
import {
  DEFAULT_SHEETS_SCOPES,
  scopeList,
} from '../data-marts/services/google-oauth/google-oauth-scopes';

const logger = createLogger('ConvertDestinationCredentials');

const UNCONVERTED = `(${UNCONVERTED_DESTINATIONS_SQL}) unconverted`;

interface DestinationRow {
  id: string;
  projectId: string;
  title: string | null;
  type: DataDestinationType;
  createdAt: Date | string;
  keyType: string;
  keyCredentials: unknown;
  keyIdentity: unknown;
}

/** Turns the old Sheets and Chat webhook key rows into Credentials and binds each Destination. */
export class ConvertDestinationCredentials1792700000000 implements MigrationInterface {
  public readonly name = 'ConvertDestinationCredentials1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DDL of an earlier migration in this run commits the runner's transaction on MySQL; reopen one.
    if (
      queryRunner.isTransactionActive &&
      ['mysql', 'mariadb'].includes(queryRunner.connection.options.type)
    ) {
      await queryRunner.query('START TRANSACTION');
    }
    const rows: DestinationRow[] = await queryRunner.query(`
      SELECT destination.id AS id, destination.projectId AS projectId,
        destination.title AS title, destination.type AS type,
        destination.createdAt AS createdAt, oldKey.type AS keyType,
        oldKey.credentials AS keyCredentials, oldKey.identity AS keyIdentity
      FROM ${UNCONVERTED}
      INNER JOIN data_destination destination ON destination.id = unconverted.id
      INNER JOIN data_destination_credentials oldKey ON oldKey.id = destination.credentialId`);
    if (rows.length === 0) return;
    const owners = await linkedIds(queryRunner, 'destination_owners', 'user_id');
    // Only Contexts of the Destination's own project carry over.
    const contexts = await linkedIds(
      queryRunner,
      'destination_contexts',
      'context_id',
      'INNER JOIN context ctx ON ctx.id = link.context_id' +
        ' AND ctx.projectId = unconverted.projectId AND ctx.deletedAt IS NULL'
    );

    // Everything is derived before the first write; a failing write aborts the migration.
    const plan = planDestinationCredentialConversion(
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
      { googleSignIn: destinationSignIn() }
    );
    for (const { destinationId, reason } of plan.skipped) {
      logger.warn(`Destination ${destinationId} keeps its old key: ${reason}`);
    }
    for (const destinationId of plan.lackingScopes) {
      logger.warn(
        `Destination ${destinationId} stops until its Credential is reconnected: its Google grant lacks a configured Sheets scope`
      );
    }
    try {
      for (const credential of plan.credentials) {
        await insertCredential(queryRunner, credential);
      }
    } catch (error) {
      // The message only: a failed write's error carries its parameters, the secret among them.
      throw new Error(`Destination keys were not converted: ${castError(error).message}`);
    }
    logger.log(
      `Converted the keys of ${rows.length - plan.skipped.length} Destinations into ${plan.credentials.length} Credentials`
    );
  }

  public async down(): Promise<void> {
    // Credentials and bindings stay: release N-1 never reads them, and up() skips bound Destinations.
  }
}

/** The owner or Context ids of each unconverted Destination. */
async function linkedIds(
  queryRunner: QueryRunner,
  table: 'destination_owners' | 'destination_contexts',
  column: 'user_id' | 'context_id',
  join = ''
): Promise<Map<string, string[]>> {
  const rows: { destinationId: string; linkedId: string }[] = await queryRunner.query(`
    SELECT link.destination_id AS destinationId, link.${column} AS linkedId
    FROM ${table} link
    INNER JOIN ${UNCONVERTED} ON unconverted.id = link.destination_id
    ${join}`);
  const ids = new Map<string, string[]>();
  for (const { destinationId, linkedId } of rows) {
    ids.set(destinationId, [...(ids.get(destinationId) ?? []), linkedId]);
  }
  return ids;
}

/** Null while sign-in is off; twin of GoogleOAuthConfigService.isDestinationConfigured. */
function destinationSignIn(): DestinationConversionOptions['googleSignIn'] {
  const env = process.env;
  const clientId = env.OAUTH_GOOGLE_DESTINATION_CLIENT_ID;
  const configured =
    clientId &&
    env.OAUTH_GOOGLE_DESTINATION_CLIENT_SECRET &&
    env.OAUTH_GOOGLE_REDIRECT_URI &&
    env.OAUTH_GOOGLE_JWT_SECRET;
  return configured
    ? {
        clientId,
        sheetsScopes: scopeList(env.OAUTH_GOOGLE_SHEETS_SCOPE) ?? [...DEFAULT_SHEETS_SCOPES],
      }
    : null;
}

async function insertCredential(
  queryRunner: QueryRunner,
  credential: PlannedDestinationCredential
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
  for (const { destinationId, requirement } of credential.bindings) {
    await queryRunner.query(
      `INSERT INTO credential_consumer_binding (id, projectId, credentialId, consumerType,
        consumerId, requirementKey, requirementSnapshot, requirementRevision, configuredById,
        active, createdAt, modifiedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        randomUUID(),
        credential.projectId,
        credentialId,
        DESTINATION_BINDING.consumerType,
        destinationId,
        DESTINATION_BINDING.requirementKey,
        JSON.stringify(requirement),
        requirementRevision(requirement),
      ]
    );
  }
}
