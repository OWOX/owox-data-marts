import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OwoxStorageConfigService } from '../owox-storage-config.service';
import { OwoxStorageProvisioningException } from '../owox-storage.exceptions';
import type { OwoxStorageLocation } from '../owox-storage-settings';
import { GcpProvisioningClient } from './gcp-provisioning.client';
import type { ManagedStorageEngine, ProvisionedManagedStorage } from './managed-storage-engine';

const JOB_USER_ROLE = 'roles/bigquery.jobUser';
// IAM needs a moment to see a new service account.
const GRANT_DELAYS_MS = [2000, 4000, 8000, 16000];

@Injectable()
export class BigQueryManagedStorageEngine implements ManagedStorageEngine {
  private readonly logger = new Logger(BigQueryManagedStorageEngine.name);

  // Replaceable in tests.
  newShortId = () => randomBytes(6).toString('hex');
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

  constructor(
    private readonly config: OwoxStorageConfigService,
    private readonly client: GcpProvisioningClient
  ) {}

  async provision(input: {
    projectId: string;
    location: OwoxStorageLocation;
  }): Promise<ProvisionedManagedStorage> {
    const { gcpProjectId, serviceAccountProjectId } = this.config.getSettings();
    const shortId = this.newShortId();
    const datasetId = `owox_${shortId}`;
    const internalDatasetId = `${datasetId}_internal`;
    const undo: (() => Promise<void>)[] = [];

    try {
      for (const id of [datasetId, internalDatasetId]) {
        await this.client.createDataset(gcpProjectId, id, input.location);
        undo.push(() => this.client.deleteDataset(gcpProjectId, id));
      }
      const email = await this.client.createServiceAccount(
        serviceAccountProjectId,
        `owox-st-${shortId}`,
        `OWOX Storage for project ${input.projectId}`
      );
      undo.push(() => this.client.deleteServiceAccount(email));

      for (const id of [datasetId, internalDatasetId]) {
        await this.withGrantRetry(() => this.client.grantDatasetWriter(gcpProjectId, id, email));
      }
      await this.withGrantRetry(() =>
        this.client.grantProjectRole(gcpProjectId, JOB_USER_ROLE, email)
      );

      return {
        engine: 'bigquery',
        gcpProjectId,
        location: input.location,
        datasetId,
        internalDatasetId,
        serviceAccountEmail: email,
      };
    } catch (error) {
      this.logger.error(
        `OWOX Storage ${shortId} provisioning failed: ${error instanceof Error ? error.name : 'unknown error'}`
      );
      for (const step of undo.reverse()) {
        try {
          await step();
        } catch (undoError) {
          this.logger.error(
            `OWOX Storage ${shortId} undo failed: ${undoError instanceof Error ? undoError.name : 'unknown error'}`
          );
        }
      }
      throw new OwoxStorageProvisioningException();
    }
  }

  async deprovision(target: ProvisionedManagedStorage): Promise<void> {
    const { gcpProjectId, serviceAccountEmail: email } = target;
    await this.client.revokeProjectRole(gcpProjectId, JOB_USER_ROLE, email);
    await this.client.deleteServiceAccount(email);
    await this.client.deleteDataset(gcpProjectId, target.datasetId);
    await this.client.deleteDataset(gcpProjectId, target.internalDatasetId);
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
