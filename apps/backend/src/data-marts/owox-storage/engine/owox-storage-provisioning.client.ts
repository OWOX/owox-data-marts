import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { z } from 'zod';
import type { OwoxStorageLocation } from '../owox-storage-settings';

const ProvisionedSchema = z.object({
  gcpProjectId: z.string().min(1),
  datasetId: z.string().min(1),
  internalDatasetId: z.string().min(1),
  location: z.enum(['US', 'EU']),
  serviceAccountEmail: z.email(),
});

export type IbProvisionedStorage = z.infer<typeof ProvisionedSchema>;

// Integrated Backend ends each call within about 25 s and answers 5xx when IAM is slower, which
// fetchWithBackoff retries (3 attempts in all); its load balancer cuts a call at 30 s. This bounds a hung attempt.
const TIMEOUT_MS = 40_000;

/**
 * Integrated Backend's internal API that creates and deletes the GCP resources of an OWOX Storage.
 * It uses the same C2C endpoint and identity as the balance check.
 */
@Injectable()
export class OwoxStorageProvisioningClient {
  private readonly idTokens = new ImpersonatedIdTokenFetcher();

  constructor(private readonly configService: ConfigService) {}

  /** Creates the datasets and the storage's service account, or finds them. Idempotent. */
  async provision(
    projectId: string,
    datasetId: string,
    location: OwoxStorageLocation
  ): Promise<IbProvisionedStorage> {
    const response = await this.call('PUT', projectId, datasetId, { location });
    return ProvisionedSchema.parse(await response.json());
  }

  /** Deletes the service account and both datasets; missing resources are not an error. */
  async deprovision(projectId: string, datasetId: string): Promise<void> {
    await this.call('DELETE', projectId, datasetId);
  }

  private async call(
    method: 'PUT' | 'DELETE',
    projectId: string,
    datasetId: string,
    body?: object
  ): Promise<Response> {
    const baseUrl = this.configService.get<string>('BALANCE_ENDPOINT_BASE_URL')?.replace(/\/$/, '');
    const account = this.configService.get<string>('BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT');
    const audience = this.configService.get<string>('BALANCE_ENDPOINT_TARGET_AUDIENCE');
    if (!baseUrl || !account || !audience) {
      throw new Error('OWOX Storage needs the Integrated Backend endpoint (BALANCE_ENDPOINT_*).');
    }
    const url = `${baseUrl}/${encodeURIComponent(projectId)}/owox-storage/datasets/${encodeURIComponent(datasetId)}`;
    const idToken = await this.idTokens.getIdToken(account, audience);
    const response = await fetchWithBackoff(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${idToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      TIMEOUT_MS
    );
    if (!response.ok) {
      // No response body: it can carry project and account ids.
      throw new Error(`Integrated Backend answered ${response.status} to OWOX Storage ${method}`);
    }
    return response;
  }
}
