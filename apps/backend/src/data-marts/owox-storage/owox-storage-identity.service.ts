import { Injectable } from '@nestjs/common';
import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth, Impersonated, OAuth2Client } from 'google-auth-library';
import type { OwoxStorageLocation } from './owox-storage-settings';

const TARGET_SCOPES = [
  'https://www.googleapis.com/auth/bigquery',
  'https://www.googleapis.com/auth/drive.readonly',
];

/** ODM's own identity (Application Default Credentials) and the storage accounts it impersonates. */
@Injectable()
export class OwoxStorageIdentity {
  // GoogleAuth caches only a successful client, so a failed lookup is retried on the next call.
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  private readonly impersonated = new Map<
    string,
    { email: string; client: Impersonated; generation: string }
  >();
  private readonly bigQueries = new Map<string, BigQuery>();

  /**
   * An empty `generation` reuses any cached client; a different non-empty one replaces it. The US
   * and EU storages of a project share an account, so a storage passes its own id as `cacheKey`:
   * their different generations then do not replace each other's client.
   */
  async impersonate(
    serviceAccountEmail: string,
    generation = '',
    cacheKey = serviceAccountEmail
  ): Promise<OAuth2Client> {
    const fits = (entry?: { email: string; client: Impersonated; generation: string }) =>
      entry?.email === serviceAccountEmail && (!generation || entry.generation === generation)
        ? entry
        : undefined;
    const cached = fits(this.impersonated.get(cacheKey));
    if (cached) return cached.client;
    const client = new Impersonated({
      sourceClient: await this.auth.getClient(),
      targetPrincipal: serviceAccountEmail,
      targetScopes: TARGET_SCOPES,
      lifetime: 3600,
    });
    // A concurrent caller may have stored one while the source resolved; keep the first.
    const stored = fits(this.impersonated.get(cacheKey));
    if (stored) return stored.client;
    this.impersonated.set(cacheKey, { email: serviceAccountEmail, client, generation });
    return client;
  }

  // A recreated account rejects the old token; other pods keep theirs until it expires.
  forget(serviceAccountEmail: string): void {
    for (const [key, entry] of this.impersonated) {
      if (entry.email === serviceAccountEmail) this.impersonated.delete(key);
    }
  }

  bigQuery(projectId: string, location: OwoxStorageLocation): BigQuery {
    const key = `${projectId}:${location}`;
    let client = this.bigQueries.get(key);
    if (!client) {
      client = new BigQuery({ projectId, location });
      this.bigQueries.set(key, client);
    }
    return client;
  }

  async bigQueryAs(
    serviceAccountEmail: string,
    projectId: string,
    location: OwoxStorageLocation,
    generation = ''
  ): Promise<BigQuery> {
    return new BigQuery({
      projectId,
      location,
      authClient: await this.impersonate(serviceAccountEmail, generation),
    });
  }
}
