import { Injectable } from '@nestjs/common';
import { BigQuery } from '@google-cloud/bigquery';
import { google } from 'googleapis';
import type { OwoxStorageLocation } from '../owox-storage-settings';

const MAX_POLICY_ATTEMPTS = 5;

type ApiError = { code?: number | string; status?: number; message?: string };

const isNotFound = (error: unknown) => {
  const e = error as ApiError;
  return e?.code === 404 || e?.status === 404;
};

const isEtagConflict = (error: unknown) => {
  const e = error as ApiError;
  return e?.code === 409 || e?.status === 409 || /ABORTED/.test(e?.message ?? '');
};

/** Google Cloud calls made with ODM's own identity (Application Default Credentials); no keys. */
@Injectable()
export class GcpProvisioningClient {
  private readonly auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  private readonly iam = google.iam({ version: 'v1', auth: this.auth });
  private readonly resourceManager = google.cloudresourcemanager({
    version: 'v1',
    auth: this.auth,
  });

  async createDataset(
    projectId: string,
    datasetId: string,
    location: OwoxStorageLocation
  ): Promise<void> {
    await new BigQuery({ projectId }).dataset(datasetId).create({ location });
  }

  async deleteDataset(projectId: string, datasetId: string): Promise<void> {
    try {
      await new BigQuery({ projectId }).dataset(datasetId).delete({ force: true });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async createServiceAccount(
    projectId: string,
    accountId: string,
    displayName: string
  ): Promise<string> {
    const { data } = await this.iam.projects.serviceAccounts.create({
      name: `projects/${projectId}`,
      requestBody: { accountId, serviceAccount: { displayName } },
    });
    if (!data.email) throw new Error('IAM returned no service account email');
    return data.email;
  }

  async deleteServiceAccount(email: string): Promise<void> {
    try {
      await this.iam.projects.serviceAccounts.delete({
        name: `projects/-/serviceAccounts/${email}`,
      });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async grantDatasetWriter(projectId: string, datasetId: string, email: string): Promise<void> {
    const dataset = new BigQuery({ projectId }).dataset(datasetId);
    const [metadata] = await dataset.getMetadata();
    const access: { role?: string; userByEmail?: string }[] = metadata.access ?? [];
    if (access.some(a => a.role === 'WRITER' && a.userByEmail === email)) return;
    await dataset.setMetadata({ access: [...access, { role: 'WRITER', userByEmail: email }] });
  }

  async grantProjectRole(projectId: string, role: string, email: string): Promise<void> {
    const member = `serviceAccount:${email}`;
    await this.editRoleMembers(projectId, role, members =>
      members.includes(member) ? members : [...members, member]
    );
  }

  async revokeProjectRole(projectId: string, role: string, email: string): Promise<void> {
    // Deleting an account before revoking its role leaves a `deleted:` member behind.
    const live = `serviceAccount:${email}`;
    const deleted = `deleted:serviceAccount:${email}?uid=`;
    await this.editRoleMembers(projectId, role, members =>
      members.filter(m => m !== live && !m.startsWith(deleted))
    );
  }

  /** Edits only the unconditional binding of the role; re-reads and retries on an etag conflict. */
  private async editRoleMembers(
    projectId: string,
    role: string,
    edit: (members: string[]) => string[]
  ): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      const { data: policy } = await this.resourceManager.projects.getIamPolicy({
        resource: projectId,
        requestBody: { options: { requestedPolicyVersion: 3 } },
      });
      const bindings = policy.bindings ?? [];
      const index = bindings.findIndex(b => b.role === role && !b.condition);
      const current = index >= 0 ? (bindings[index].members ?? []) : [];
      const next = edit(current);
      if (next.length === current.length && next.every((m, i) => m === current[i])) return;

      if (index < 0) bindings.push({ role, members: next });
      else if (next.length === 0) bindings.splice(index, 1);
      else bindings[index] = { ...bindings[index], members: next };

      try {
        await this.resourceManager.projects.setIamPolicy({
          resource: projectId,
          requestBody: { policy: { ...policy, bindings } },
        });
        return;
      } catch (error) {
        if (!isEtagConflict(error) || attempt >= MAX_POLICY_ATTEMPTS) throw error;
      }
    }
  }
}
