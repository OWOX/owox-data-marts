import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { TableMetadata } from '@google-cloud/bigquery';
import { castError, runWithConcurrency } from '@owox/internal-helpers';
import { randomBytes } from 'crypto';
import { OwoxStorageIdentity } from '../owox-storage-identity.service';
import { OwoxStorageProvisioningException } from '../owox-storage.exceptions';
import type { OwoxStorageLocation } from '../owox-storage-settings';
import {
  type IbProvisionedStorage,
  OwoxStorageProvisioningClient,
} from './owox-storage-provisioning.client';
import type {
  ManagedStorageEngine,
  ManagedTable,
  ProvisionedManagedStorage,
} from './managed-storage-engine';

// IAM applies a new token creator grant in seconds to minutes; runs do not retry impersonation.
// 40 s of waits, about 45 s with token calls: the load balancer allows 180 s, IB uses up to 85 s.
const USABLE_WAITS_MS = [1_000, 2_000, 4_000, 8_000, 10_000, 15_000];
// A storage usually holds a handful of tables; this caps the metadata reads in flight.
const TABLE_METADATA_CONCURRENCY = 8;

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

/**
 * Integrated Backend creates and deletes the datasets and the storage's own service account;
 * ODM reads the datasets and runs the customer's work as that account.
 */
@Injectable()
export class BigQueryManagedStorageEngine implements ManagedStorageEngine {
  private readonly logger = new Logger(BigQueryManagedStorageEngine.name);

  // Replaceable in tests.
  newShortId = () => randomBytes(6).toString('hex');
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  constructor(
    private readonly client: OwoxStorageProvisioningClient,
    private readonly identity: OwoxStorageIdentity
  ) {}

  async provision(input: {
    projectId: string;
    location: OwoxStorageLocation;
  }): Promise<ProvisionedManagedStorage> {
    // The location in the name keeps the storages of one project apart in the console.
    const datasetId = `owox_${input.location.toLowerCase()}_${this.newShortId()}`;
    let created: IbProvisionedStorage;
    try {
      created = await this.client.provision(input.projectId, datasetId, input.location);
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${datasetId} provisioning failed (${castError(error).message})`
      );
      // The call may have created a dataset before it failed.
      try {
        await this.client.deprovision(input.projectId, datasetId);
      } catch (undoError) {
        this.logger.error(
          `OWOX Storage ${datasetId} undo failed (${castError(undoError).message})`
        );
      }
      const exception = new OwoxStorageProvisioningException();
      exception.cause = error;
      throw exception;
    }
    await this.waitUntilUsable(created.serviceAccountEmail, datasetId);
    return { engine: 'bigquery', projectId: input.projectId, ...created };
  }

  async restore(
    target: ProvisionedManagedStorage,
    projectId: string,
    leftovers: boolean
  ): Promise<void> {
    const { datasetId, serviceAccountEmail } = target;
    // A recreated account keeps its email but rejects the old account's token.
    this.identity.forget(serviceAccountEmail);
    try {
      // A deletion that failed half-way can leave a dataset without its account: start clean.
      if (leftovers) await this.client.deprovision(projectId, datasetId);
      const restored = await this.client.provision(projectId, datasetId, target.location);
      if (restored.serviceAccountEmail !== serviceAccountEmail) {
        // Every run impersonates the stored account; a different one would fail them all.
        throw new Error(`OWOX Storage ${datasetId} restore returned another service account`);
      }
    } catch (error) {
      this.logger.error(`OWOX Storage ${datasetId} restore failed (${castError(error).message})`);
      throw error;
    }
    await this.waitUntilUsable(serviceAccountEmail, datasetId);
  }

  async deprovision(target: ProvisionedManagedStorage): Promise<void> {
    this.identity.forget(target.serviceAccountEmail);
    await this.client.deprovision(target.projectId, target.datasetId);
  }

  async listTables(target: ProvisionedManagedStorage): Promise<ManagedTable[]> {
    // ODM's own identity, metadata calls only: it may not read table data, and no job runs.
    const [tables] = await this.identity
      .bigQuery(target.gcpProjectId, target.location)
      .dataset(target.datasetId)
      .getTables();
    const listed = await runWithConcurrency(tables, TABLE_METADATA_CONCURRENCY, async table => {
      // The list carries no size; a view has none.
      const [metadata] = await table.getMetadata();
      const { numBytes, numRows } = metadata as TableMetadata;
      return {
        name: table.id ?? '',
        sizeBytes: Number(numBytes ?? 0),
        rowCount: Number(numRows ?? 0),
      };
    });
    return listed.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  async dropTable(
    target: ProvisionedManagedStorage,
    tableName: string,
    generation?: string
  ): Promise<void> {
    // Only a name the dataset itself lists reaches the delete call.
    const listed = (await this.listTables(target)).some(table => table.name === tableName);
    if (!listed) {
      throw new NotFoundException(`Table ${tableName} was not found in this OWOX Storage.`);
    }
    const bigQuery = await this.identity.bigQueryAs(
      target.serviceAccountEmail,
      target.gcpProjectId,
      target.location,
      generation
    );
    await bigQuery.dataset(target.datasetId).table(tableName).delete();
  }

  /** Waits until ODM can impersonate the new account; one still refused is logged, not thrown. */
  private async waitUntilUsable(serviceAccountEmail: string, datasetId: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const client = await this.identity.impersonate(serviceAccountEmail);
        await client.getAccessToken();
        return;
      } catch (error) {
        const status = (error as { status?: unknown } | null)?.status;
        // 403: the token creator grant is not applied yet; 404: IAM does not see the account yet.
        if ((status !== 403 && status !== 404) || attempt >= USABLE_WAITS_MS.length) {
          this.logger.warn(
            `OWOX Storage ${datasetId}: ODM cannot use its service account yet${describeGoogleError(error)}; its first load can fail`
          );
          return;
        }
        await this.sleep(USABLE_WAITS_MS[attempt]);
      }
    }
  }
}
