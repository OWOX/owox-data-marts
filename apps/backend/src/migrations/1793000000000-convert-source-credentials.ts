import { AvailableConnectors } from '@owox/connectors';
import { castError } from '@owox/internal-helpers';
import { randomUUID } from 'node:crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import {
  SOURCE_BINDING_CONSUMER_TYPE,
  sourceCredentialRequirement,
} from '../data-marts/connector-types/source-credential-state';
import { oldKeyIdsOf } from '../data-marts/connector-types/source-key-fields';
import type { AcceptedCredentialRequirement } from '../data-marts/credentials/credential.types';
import { requirementRevision } from '../data-marts/credentials/services/credential-requirement-revision';
import { UNCONVERTED_SOURCE_CONFIGS_SQL } from '../data-marts/services/source-credential-conversion/legacy-source-credential-sql';
import {
  planSourceCredentialConversion,
  type OldSourceKeyRow,
  type PlannedSourceCredential,
  type SourceConversionPlan,
  type UnconvertedSourceConfig,
} from '../data-marts/services/source-credential-conversion/source-credential-conversion-plan';
import { parsedJson } from '../data-marts/services/storage-credential-conversion/grouping';

const logger = createLogger('ConvertSourceCredentials');

const UNCONVERTED = `(${UNCONVERTED_SOURCE_CONFIGS_SQL}) unconverted`;

const BUNDLED: ReadonlySet<string> = new Set(AvailableConnectors as string[]);

/** Ids per `IN (...)` list, well under the bound-parameter limits of SQLite and MySQL. */
const ID_CHUNK = 500;

interface DataMartRow {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date | string;
  definition: unknown;
}

interface OldRowRecord {
  id: string;
  projectId: string;
  connectorName: string;
  userId: string | null;
  credentials: unknown;
  keyUser: unknown;
  expiresAt: Date | string | null;
}

interface SourceDefinition {
  connector?: {
    source?: { name?: unknown; version?: unknown; configuration?: unknown };
  };
}

/** Turns the old Source key rows and inline key values into Credentials and binds each configuration. */
export class ConvertSourceCredentials1793000000000 implements MigrationInterface {
  public readonly name = 'ConvertSourceCredentials1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DDL of an earlier migration in this run commits the runner's transaction on MySQL; reopen one.
    if (
      queryRunner.isTransactionActive &&
      ['mysql', 'mariadb'].includes(queryRunner.connection.options.type)
    ) {
      await queryRunner.query('START TRANSACTION');
    }
    const dataMarts: DataMartRow[] = await queryRunner.query(`
      SELECT dataMart.id AS id, dataMart.projectId AS projectId, dataMart.title AS title,
        dataMart.createdAt AS createdAt, dataMart.definition AS definition
      FROM ${UNCONVERTED}
      INNER JOIN data_mart dataMart ON dataMart.id = unconverted.id`);
    if (dataMarts.length === 0) return;
    const bound: { consumerId: string; requirementKey: string }[] = await queryRunner.query(
      `SELECT binding.consumerId AS consumerId, binding.requirementKey AS requirementKey
      FROM credential_consumer_binding binding
      INNER JOIN ${UNCONVERTED} ON unconverted.id = binding.consumerId
      WHERE binding.consumerType = ?`,
      [SOURCE_BINDING_CONSUMER_TYPE]
    );
    const boundKeys = new Set(
      bound.map(row => JSON.stringify([row.consumerId, row.requirementKey]))
    );
    const technicalOwners = await linkedIds(queryRunner, 'data_mart_technical_owners', 'user_id');
    const businessOwners = await linkedIds(queryRunner, 'data_mart_business_owners', 'user_id');
    // Only live Contexts of the Data Mart's own project carry over.
    const contexts = await linkedIds(
      queryRunner,
      'data_mart_contexts',
      'context_id',
      'INNER JOIN context ctx ON ctx.id = link.context_id' +
        ' AND ctx.projectId = unconverted.projectId AND ctx.deletedAt IS NULL'
    );
    const customConnectors = new Map<string, UnconvertedSourceConfig['custom']>();

    const sources: UnconvertedSourceConfig[] = [];
    for (const dataMart of dataMarts) {
      let source: NonNullable<SourceDefinition['connector']>['source'];
      try {
        source = (parsedJson(dataMart.definition) as SourceDefinition | null)?.connector?.source;
      } catch {
        // A definition that does not parse does not run either.
        continue;
      }
      const name = source?.name;
      if (typeof name !== 'string' || !Array.isArray(source?.configuration)) continue;
      const version = typeof source.version === 'number' ? source.version : undefined;
      const lookup = JSON.stringify([dataMart.projectId, name, version]);
      if (!BUNDLED.has(name) && !customConnectors.has(lookup)) {
        customConnectors.set(
          lookup,
          await customConnector(queryRunner, dataMart.projectId, name, version)
        );
      }
      for (const config of source.configuration as Record<string, unknown>[]) {
        if (boundKeys.has(JSON.stringify([dataMart.id, config?._id]))) continue;
        sources.push({
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          dataMartTitle: dataMart.title,
          createdAt: new Date(dataMart.createdAt),
          technicalOwnerIds: technicalOwners.get(dataMart.id) ?? [],
          businessOwnerIds: businessOwners.get(dataMart.id) ?? [],
          contextIds: contexts.get(dataMart.id) ?? [],
          connectorName: name,
          config: config ?? {},
          ...(!BUNDLED.has(name) && { custom: customConnectors.get(lookup) }),
        });
      }
    }
    if (sources.length === 0) return;
    const referenced = [...new Set(sources.flatMap(source => oldKeyIdsOf(source.config)))];
    const oldRows = await oldKeyRows(queryRunner, referenced);
    const credentials = await namedCredentials(queryRunner, referenced);

    // Everything is derived before the first write; a failing write aborts the migration.
    const plan = planSourceCredentialConversion(sources, {
      oldRows,
      credentials,
    });
    for (const { dataMartId, configId, reason } of plan.skipped) {
      logger.warn(
        `Data Mart ${dataMartId} configuration ${configId ?? '(no id)'} keeps its old key: ${reason}`
      );
    }
    for (const { dataMartId, configId, reason } of plan.warnings) {
      logger.warn(`Data Mart ${dataMartId} configuration ${configId} converted, but ${reason}`);
    }
    const requirement = sourceCredentialRequirement();
    try {
      for (const credential of plan.credentials) {
        await insertCredential(queryRunner, credential, requirement);
      }
      for (const binding of plan.bindings) {
        await insertBinding(queryRunner, binding, requirement);
      }
    } catch (error) {
      // The message only: a failed write's error carries its parameters, the secret among them.
      throw new Error(`Source keys were not converted: ${castError(error).message}`);
    }
    const converted = plan.credentials.reduce(
      (count, credential) => count + credential.bindings.length,
      plan.bindings.length
    );
    logger.log(
      `Converted the keys of ${converted} Data Mart configurations into ${plan.credentials.length} Credentials`
    );
  }

  public async down(): Promise<void> {
    // Credentials and bindings stay: release N-1 never reads them, and up() skips bound configurations.
  }
}

/** The owner or Context ids of each unconverted Data Mart. */
async function linkedIds(
  queryRunner: QueryRunner,
  table: 'data_mart_technical_owners' | 'data_mart_business_owners' | 'data_mart_contexts',
  column: 'user_id' | 'context_id',
  join = ''
): Promise<Map<string, string[]>> {
  const rows: { dataMartId: string; linkedId: string }[] = await queryRunner.query(`
    SELECT link.data_mart_id AS dataMartId, link.${column} AS linkedId
    FROM ${table} link
    INNER JOIN ${UNCONVERTED} ON unconverted.id = link.data_mart_id
    ${join}`);
  const ids = new Map<string, string[]>();
  for (const { dataMartId, linkedId } of rows) {
    ids.set(dataMartId, [...(ids.get(dataMartId) ?? []), linkedId]);
  }
  return ids;
}

/** The title and manifest a custom connector runs, as the run resolves them; undefined when there is no such connector. */
async function customConnector(
  queryRunner: QueryRunner,
  projectId: string,
  name: string,
  version: number | undefined
): Promise<UnconvertedSourceConfig['custom']> {
  const [found]: { title: string; manifest: unknown }[] = await queryRunner.query(
    `SELECT def.title AS title, published.manifest AS manifest
    FROM connector_definition def
    LEFT JOIN connector_definition_version published
      ON published.connectorDefinitionId = def.id AND published.status = 'published'
      AND ${version === undefined ? 'published.id = def.activeVersionId' : 'published.version = ?'}
    WHERE def.projectId = ? AND def.name = ? AND def.deletedAt IS NULL`,
    version === undefined ? [projectId, name] : [version, projectId, name]
  );
  if (!found) return undefined;
  return found.manifest == null ? null : { title: found.title, manifest: found.manifest };
}

async function oldKeyRows(
  queryRunner: QueryRunner,
  ids: readonly string[]
): Promise<Map<string, OldSourceKeyRow>> {
  const rows = await byIds<OldRowRecord>(
    queryRunner,
    `SELECT oldKey.id AS id, oldKey.projectId AS projectId, oldKey.connectorName AS connectorName,
      oldKey.userId AS userId, oldKey.credentials AS credentials, oldKey.user AS keyUser,
      oldKey.expiresAt AS expiresAt
    FROM connector_source_credentials oldKey
    WHERE oldKey.deletedAt IS NULL AND oldKey.id IN`,
    ids
  );
  return new Map(
    rows.map(row => [
      row.id,
      {
        projectId: row.projectId,
        connectorName: row.connectorName,
        userId: row.userId,
        credentials: row.credentials,
        user: row.keyUser,
        expiresAt: utcDate(row.expiresAt),
      },
    ])
  );
}

/** Credentials a `_source_credential_id` names, saved by the Connect of a form built mid-release. */
async function namedCredentials(
  queryRunner: QueryRunner,
  ids: readonly string[]
): Promise<Map<string, { projectId: string; definitionId: string }>> {
  const rows = await byIds<{ id: string; projectId: string; definitionId: string }>(
    queryRunner,
    `SELECT credential.id AS id, credential.projectId AS projectId,
      credential.definitionId AS definitionId
    FROM credential
    WHERE credential.deletedAt IS NULL AND credential.id IN`,
    ids
  );
  return new Map(rows.map(({ id, ...credential }) => [id, credential]));
}

async function byIds<T>(
  queryRunner: QueryRunner,
  sqlEndingInIn: string,
  ids: readonly string[]
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    const chunk = ids.slice(start, start + ID_CHUNK);
    rows.push(
      ...((await queryRunner.query(
        `${sqlEndingInIn} (${chunk.map(() => '?').join(', ')})`,
        chunk
      )) as T[])
    );
  }
  return rows;
}

/** SQLite returns a datetime as UTC text without a zone, MySQL as a Date; an unreadable one is none. */
function utcDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const date =
    value instanceof Date
      ? value
      : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function insertCredential(
  queryRunner: QueryRunner,
  credential: PlannedSourceCredential,
  requirement: AcceptedCredentialRequirement
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
  for (const binding of credential.bindings) {
    await insertBinding(
      queryRunner,
      { ...binding, projectId: credential.projectId, credentialId },
      requirement
    );
  }
}

async function insertBinding(
  queryRunner: QueryRunner,
  { projectId, credentialId, dataMartId, configId }: SourceConversionPlan['bindings'][number],
  requirement: AcceptedCredentialRequirement
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO credential_consumer_binding (id, projectId, credentialId, consumerType,
      consumerId, requirementKey, requirementSnapshot, requirementRevision, configuredById,
      active, createdAt, modifiedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      randomUUID(),
      projectId,
      credentialId,
      SOURCE_BINDING_CONSUMER_TYPE,
      dataMartId,
      configId,
      JSON.stringify(requirement),
      requirementRevision(requirement),
    ]
  );
}
