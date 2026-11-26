import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { z } from 'zod';
import type { OwoxStorageLocation } from '../owox-storage-settings';

const ProvisionedSchema = z.object({
  gcpProjectId: z.string().min(1),
  processProjectId: z.string().min(1),
  datasetId: z.string().min(1),
  internalDatasetId: z.string().min(1),
  location: z.enum(['US', 'EU']),
  serviceAccountEmail: z.email(),
});

export type IbProvisionedStorage = z.infer<typeof ProvisionedSchema>;

// Integrated Backend starts no step after 20 s of a call and answers 5xx when Google is slower, which
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

  /** Creates the datasets and gives the project's service account access, or finds them. Idempotent. */
  async provision(
    projectId: string,
    datasetId: string,
    location: OwoxStorageLocation
  ): Promise<IbProvisionedStorage> {
    const response = await this.call('PUT', projectId, datasetId, { location });
    return ProvisionedSchema.parse(await response.json());
  }

  /**
   * Deletes both datasets. After the project's last storage, its service account loses OWOX Storage access; the
   * account stays. Missing datasets are not an error.
   */
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
    ).catch((error: unknown) => {
      // After the last retry of a 5xx or 429 answer, fetchWithBackoff throws with the status of that answer.
      const status = (error as { status?: number } | null)?.status;
      throw status ? this.answered(status, method) : error;
    });
    if (!response.ok) {
      // No response body: it can carry project and account ids.
      throw this.answered(response.status, method);
    }
    return response;
  }

  /** The code lets describeGoogleError log the status, so ops can tell a 409 from a 502. */
  private answered(status: number, method: string): Error {
    return Object.assign(
      new Error(`Integrated Backend answered ${status} to OWOX Storage ${method}`),
      {
        code: status,
      }
    );
  }
}
