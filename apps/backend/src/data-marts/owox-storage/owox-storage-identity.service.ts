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
  private source?: Promise<Awaited<ReturnType<GoogleAuth['getClient']>>>;
  private readonly impersonated = new Map<string, Impersonated>();
  private readonly bigQueries = new Map<string, BigQuery>();

  async impersonate(serviceAccountEmail: string): Promise<OAuth2Client> {
    const cached = this.impersonated.get(serviceAccountEmail);
    if (cached) return cached;
    this.source ??= new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    }).getClient();
    const client = new Impersonated({
      sourceClient: await this.source,
      targetPrincipal: serviceAccountEmail,
      targetScopes: TARGET_SCOPES,
      lifetime: 3600,
    });
    // A concurrent caller may have stored one while the source resolved; keep the first.
    return (
      this.impersonated.get(serviceAccountEmail) ??
      this.impersonated.set(serviceAccountEmail, client).get(serviceAccountEmail)!
    );
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
}
