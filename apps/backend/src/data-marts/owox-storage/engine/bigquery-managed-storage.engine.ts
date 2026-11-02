import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OwoxStorageConfigService } from '../owox-storage-config.service';
import { OwoxStorageIdentity } from '../owox-storage-identity.service';
import { OwoxStorageProvisioningException } from '../owox-storage.exceptions';
import type { OwoxStorageLocation } from '../owox-storage-settings';
import { GcpProvisioningClient } from './gcp-provisioning.client';
import type {
  ManagedStorageEngine,
  ManagedTable,
  ProvisionedManagedStorage,
} from './managed-storage-engine';

const JOB_USER_ROLE = 'roles/bigquery.jobUser';
// IAM needs a moment to see a new service account.
const GRANT_DELAYS_MS = [2000, 4000, 8000, 16000];

type GoogleError = {
  code?: number | string;
  errors?: { reason?: string }[];
  response?: { data?: { error?: { status?: string } } };
};

/** HTTP code and Google status/reason only: messages can carry emails and project ids. */
export function describeGoogleError(error: unknown): string {
  const e = (error ?? {}) as GoogleError;
  const status = e.response?.data?.error?.status ?? e.errors?.[0]?.reason;
  return ` (code ${e.code ?? 'unknown'}${status ? `, ${status}` : ''})`;
}

@Injectable()
export class BigQueryManagedStorageEngine implements ManagedStorageEngine {
  private readonly logger = new Logger(BigQueryManagedStorageEngine.name);

  // Replaceable in tests.
  newShortId = () => randomBytes(6).toString('hex');
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  constructor(
    private readonly config: OwoxStorageConfigService,
    private readonly client: GcpProvisioningClient,
    private readonly identity: OwoxStorageIdentity
  ) {}

  async provision(input: {
    projectId: string;
    location: OwoxStorageLocation;
  }): Promise<ProvisionedManagedStorage> {
    const { gcpProjectId, serviceAccountProjectId } = this.config.getSettings();
    const shortId = this.newShortId();
    const datasetId = `owox_${shortId}`;
    const internalDatasetId = `${datasetId}_internal`;
    const email = `owox-st-${shortId}@${serviceAccountProjectId}.iam.gserviceaccount.com`;
    // Registered before each create: a create that commits but errors must still be rolled back.
    const undo: { name: string; run: () => Promise<void> }[] = [];
    let step = '';
    const run = async <T>(name: string, fn: () => Promise<T>, undoStep?: (typeof undo)[number]) => {
      step = name;
      if (undoStep) undo.push(undoStep);
      return fn();
    };

    try {
      for (const id of [datasetId, internalDatasetId]) {
        await run(
          'createDataset',
          () => this.client.createDataset(gcpProjectId, id, input.location),
          {
            name: 'deleteDataset',
            run: () => this.client.deleteDataset(gcpProjectId, id),
          }
        );
      }
      const created = await run(
        'createServiceAccount',
        () =>
          this.client.createServiceAccount(
            serviceAccountProjectId,
            `owox-st-${shortId}`,
            `OWOX Storage for project ${input.projectId}`
          ),
        { name: 'deleteServiceAccount', run: () => this.client.deleteServiceAccount(email) }
      );

      for (const id of [datasetId, internalDatasetId]) {
        await run('grantDatasetWriter', () =>
          this.withGrantRetry(() => this.client.grantDatasetWriter(gcpProjectId, id, created))
        );
      }
      await run(
        'grantProjectRole',
        () =>
          this.withGrantRetry(() =>
            this.client.grantProjectRole(gcpProjectId, JOB_USER_ROLE, created)
          ),
        {
          name: 'revokeProjectRole',
          run: () => this.client.revokeProjectRole(gcpProjectId, JOB_USER_ROLE, email),
        }
      );

      return {
        engine: 'bigquery',
        gcpProjectId,
        location: input.location,
        datasetId,
        internalDatasetId,
        serviceAccountEmail: created,
      };
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${shortId} provisioning failed at ${step}${describeGoogleError(error)}`
      );
      for (const undoStep of undo.reverse()) {
        try {
          await undoStep.run();
        } catch (undoError) {
          this.logger.error(
            `OWOX Storage ${shortId} undo failed at ${undoStep.name}${describeGoogleError(undoError)}`
          );
        }
      }
      const exception = new OwoxStorageProvisioningException();
      exception.cause = error;
      throw exception;
    }
  }

  async deprovision(target: ProvisionedManagedStorage): Promise<void> {
    const { gcpProjectId, serviceAccountEmail: email } = target;
    const steps: [string, () => Promise<void>][] = [
      [
        'revokeProjectRole',
        () => this.client.revokeProjectRole(gcpProjectId, JOB_USER_ROLE, email),
      ],
      ['deleteServiceAccount', () => this.client.deleteServiceAccount(email)],
      ['deleteDataset', () => this.client.deleteDataset(gcpProjectId, target.datasetId)],
      ['deleteDataset', () => this.client.deleteDataset(gcpProjectId, target.internalDatasetId)],
    ];
    // Every step runs: one failure must not leave the rest behind.
    const failures: unknown[] = [];
    for (const [name, run] of steps) {
      try {
        await run();
      } catch (error) {
        failures.push(error);
        this.logger.error(
          `OWOX Storage ${target.datasetId} deprovision failed at ${name}${describeGoogleError(error)}`
        );
      }
    }
    if (failures.length > 0) throw failures[0];
  }

  async listTables(target: ProvisionedManagedStorage): Promise<ManagedTable[]> {
    const { gcpProjectId, datasetId, location } = target;
    // ODM's own identity: the storage account's job history must stay the customer's.
    const [rows] = await this.identity.bigQuery(gcpProjectId, location).query({
      query: `SELECT table_id, size_bytes, row_count FROM \`${gcpProjectId}.${datasetId}.__TABLES__\` ORDER BY table_id`,
    });
    return (rows as { table_id: string; size_bytes: string; row_count: string }[]).map(row => ({
      name: row.table_id,
      sizeBytes: Number(row.size_bytes),
      rowCount: Number(row.row_count),
    }));
  }

  async lastJobTimes(
    targets: ProvisionedManagedStorage[],
    since: Date
  ): Promise<Map<string, Date>> {
    const groups = new Map<string, ProvisionedManagedStorage[]>();
    for (const target of targets) {
      const key = `${target.gcpProjectId}:${target.location}`;
      groups.set(key, [...(groups.get(key) ?? []), target]);
    }
    const result = new Map<string, Date>();
    for (const [first, ...rest] of groups.values()) {
      const { gcpProjectId, location } = first;
      const emails = [first, ...rest].map(t => t.serviceAccountEmail);
      // ODM's own identity: reading the history must not count as the account's use.
      const [rows] = await this.identity.bigQuery(gcpProjectId, location).query({
        query: `SELECT user_email, MAX(creation_time) AS last_job FROM \`${gcpProjectId}.region-${location.toLowerCase()}.INFORMATION_SCHEMA.JOBS_BY_PROJECT\` WHERE creation_time >= @since AND user_email IN UNNEST(@emails) GROUP BY user_email`,
        params: { since, emails },
      });
      for (const row of rows as { user_email: string; last_job: { value: string } | Date }[]) {
        const { last_job: time } = row;
        result.set(row.user_email, new Date(time instanceof Date ? time : time.value));
      }
    }
    return result;
  }

  async dropTable(target: ProvisionedManagedStorage, tableName: string): Promise<void> {
    // Only a name the dataset itself lists reaches the delete call.
    const listed = (await this.listTables(target)).some(table => table.name === tableName);
    if (!listed) {
      throw new NotFoundException(`Table ${tableName} was not found in this OWOX Storage.`);
    }
    const bigQuery = await this.identity.bigQueryAs(
      target.serviceAccountEmail,
      target.gcpProjectId,
      target.location
    );
    await bigQuery.dataset(target.datasetId).table(tableName).delete();
  }

  private async withGrantRetry(grant: () => Promise<void>): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await grant();
      } catch (error) {
        if (attempt >= GRANT_DELAYS_MS.length) throw error;
        await this.sleep(GRANT_DELAYS_MS[attempt]);
      }
    }
  }
}
