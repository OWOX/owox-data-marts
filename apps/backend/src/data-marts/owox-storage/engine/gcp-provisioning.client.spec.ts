const getIamPolicy = jest.fn();
const setIamPolicy = jest.fn();
const saDelete = jest.fn();
const dsDelete = jest.fn();
const getMetadata = jest.fn();
const setMetadata = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: jest.fn() },
    iam: () => ({ projects: { serviceAccounts: { create: jest.fn(), delete: saDelete } } }),
    cloudresourcemanager: () => ({ projects: { getIamPolicy, setIamPolicy } }),
  },
}));
jest.mock('@google-cloud/bigquery', () => ({
  BigQuery: jest.fn().mockImplementation(() => ({
    dataset: () => ({ create: jest.fn(), delete: dsDelete, getMetadata, setMetadata }),
  })),
}));

import { GcpProvisioningClient } from './gcp-provisioning.client';

const ROLE = 'roles/bigquery.jobUser';
const EMAIL = 'a@p.iam.gserviceaccount.com';
const conditional = {
  role: ROLE,
  members: ['user:x@example.com'],
  condition: { expression: 'true', title: 't' },
};

const policy = (bindings: unknown[]) => ({ data: { version: 3, etag: 'e1', bindings } });
const written = () => setIamPolicy.mock.calls.at(-1)[0].requestBody.policy;

describe('GcpProvisioningClient', () => {
  let client: GcpProvisioningClient;
  beforeEach(() => {
    jest.clearAllMocks();
    setIamPolicy.mockResolvedValue({});
    client = new GcpProvisioningClient();
  });

  it('reads the policy with version 3', async () => {
    getIamPolicy.mockImplementation(() => Promise.resolve(policy([])));
    await client.grantProjectRole('proj', ROLE, EMAIL);
    expect(getIamPolicy).toHaveBeenCalledWith({
      resource: 'proj',
      requestBody: { options: { requestedPolicyVersion: 3 } },
    });
  });

  it('revoke removes the live and the deleted member and keeps a conditional binding', async () => {
    getIamPolicy.mockResolvedValue(
      policy([
        {
          role: ROLE,
          members: [
            `serviceAccount:${EMAIL}`,
            `deleted:serviceAccount:${EMAIL}?uid=123`,
            'user:keep@example.com',
          ],
        },
        conditional,
        { role: 'roles/viewer', members: [`serviceAccount:${EMAIL}`] },
      ])
    );
    await client.revokeProjectRole('proj', ROLE, EMAIL);

    const p = written();
    expect(p.etag).toBe('e1');
    expect(p.version).toBe(3);
    expect(p.bindings).toEqual([
      { role: ROLE, members: ['user:keep@example.com'] },
      conditional,
      { role: 'roles/viewer', members: [`serviceAccount:${EMAIL}`] },
    ]);
  });

  it('revoke drops the binding when it becomes empty', async () => {
    getIamPolicy.mockResolvedValue(
      policy([{ role: ROLE, members: [`serviceAccount:${EMAIL}`] }, conditional])
    );
    await client.revokeProjectRole('proj', ROLE, EMAIL);
    expect(written().bindings).toEqual([conditional]);
  });

  it('re-reads and retries on an etag conflict, re-applying the edit to the fresh policy', async () => {
    getIamPolicy.mockResolvedValueOnce(policy([])).mockResolvedValueOnce({
      data: {
        version: 3,
        etag: 'e2',
        bindings: [{ role: ROLE, members: ['user:other@example.com'] }],
      },
    });
    setIamPolicy.mockRejectedValueOnce({ code: 409 }).mockResolvedValue({});
    await client.grantProjectRole('proj', ROLE, EMAIL);

    expect(getIamPolicy).toHaveBeenCalledTimes(2);
    expect(setIamPolicy).toHaveBeenCalledTimes(2);
    const p = written();
    expect(p.etag).toBe('e2');
    expect(p.bindings).toEqual([
      { role: ROLE, members: ['user:other@example.com', `serviceAccount:${EMAIL}`] },
    ]);
  });

  it('deletes an account through its own project, not the wildcard', async () => {
    saDelete.mockResolvedValue({});
    await client.deleteServiceAccount('owox-st-abc@sa-project.iam.gserviceaccount.com');
    expect(saDelete).toHaveBeenCalledWith({
      name: 'projects/sa-project/serviceAccounts/owox-st-abc@sa-project.iam.gserviceaccount.com',
    });
  });

  it('gives up after 5 conflicts', async () => {
    getIamPolicy.mockImplementation(() => Promise.resolve(policy([])));
    setIamPolicy.mockRejectedValue({ code: 409 });
    await expect(client.grantProjectRole('proj', ROLE, EMAIL)).rejects.toEqual({ code: 409 });
    expect(setIamPolicy).toHaveBeenCalledTimes(5);
  });

  it('grant is idempotent for the project role', async () => {
    getIamPolicy.mockResolvedValue(
      policy([{ role: ROLE, members: [`serviceAccount:${EMAIL}`] }, conditional])
    );
    await client.grantProjectRole('proj', ROLE, EMAIL);
    expect(setIamPolicy).not.toHaveBeenCalled();
  });

  it('grant adds to the unconditional binding only', async () => {
    getIamPolicy.mockResolvedValue(policy([conditional]));
    await client.grantProjectRole('proj', ROLE, EMAIL);
    expect(written().bindings).toEqual([
      conditional,
      { role: ROLE, members: [`serviceAccount:${EMAIL}`] },
    ]);
  });

  it('grants dataset WRITER once', async () => {
    getMetadata.mockResolvedValue([{ access: [{ role: 'OWNER', userByEmail: 'o@x.com' }] }]);
    await client.grantDatasetWriter('proj', 'ds', EMAIL);
    expect(setMetadata).toHaveBeenCalledWith({
      access: [
        { role: 'OWNER', userByEmail: 'o@x.com' },
        { role: 'WRITER', userByEmail: EMAIL },
      ],
    });

    setMetadata.mockClear();
    getMetadata.mockResolvedValue([{ access: [{ role: 'WRITER', userByEmail: EMAIL }] }]);
    await client.grantDatasetWriter('proj', 'ds', EMAIL);
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it('delete of a missing account or dataset resolves', async () => {
    saDelete.mockRejectedValue({ code: 404 });
    dsDelete.mockRejectedValue({ code: 404 });
    await expect(client.deleteServiceAccount(EMAIL)).resolves.toBeUndefined();
    await expect(client.deleteDataset('proj', 'ds')).resolves.toBeUndefined();
  });

  it('delete rethrows other errors', async () => {
    dsDelete.mockRejectedValue({ code: 500 });
    await expect(client.deleteDataset('proj', 'ds')).rejects.toEqual({ code: 500 });
  });
});
