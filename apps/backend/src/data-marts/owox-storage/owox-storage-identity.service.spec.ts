import { BigQuery } from '@google-cloud/bigquery';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { OwoxStorageIdentity } from './owox-storage-identity.service';

const getClient = jest.fn();
jest.mock('@google-cloud/bigquery', () => ({ BigQuery: jest.fn().mockImplementation(() => ({})) }));
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({ getClient })),
  Impersonated: jest.fn().mockImplementation(() => ({})),
  OAuth2Client: jest.fn(),
}));

describe('OwoxStorageIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getClient.mockResolvedValue({});
  });

  it('reuses one impersonated client per email', async () => {
    const identity = new OwoxStorageIdentity();
    const [a1, a2] = await Promise.all([identity.impersonate('a@x'), identity.impersonate('a@x')]);
    const b = await identity.impersonate('b@x');
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(Impersonated).toHaveBeenLastCalledWith(
      expect.objectContaining({
        targetPrincipal: 'b@x',
        targetScopes: [
          'https://www.googleapis.com/auth/bigquery',
          'https://www.googleapis.com/auth/drive.readonly',
        ],
        lifetime: 3600,
      })
    );
  });

  it('replaces the client when the record generation changes and reuses it for an empty one', async () => {
    const identity = new OwoxStorageIdentity();
    const g1 = await identity.impersonate('a@x', '1');
    expect(await identity.impersonate('a@x', '1')).toBe(g1);
    expect(await identity.impersonate('a@x')).toBe(g1);
    const g2 = await identity.impersonate('a@x', '2');
    expect(g2).not.toBe(g1);
    expect(await identity.impersonate('a@x')).toBe(g2);
    expect(await identity.impersonate('a@x', '2')).toBe(g2);
  });

  it('forgets the cached client of one email only', async () => {
    const identity = new OwoxStorageIdentity();
    const a = await identity.impersonate('a@x');
    const b = await identity.impersonate('b@x');
    identity.forget('a@x');
    expect(await identity.impersonate('a@x')).not.toBe(a);
    expect(await identity.impersonate('b@x')).toBe(b);
  });

  it('retries ODM own credentials after a failed lookup', async () => {
    getClient.mockRejectedValueOnce(new Error('metadata server not ready'));
    const identity = new OwoxStorageIdentity();
    await expect(identity.impersonate('a@x')).rejects.toThrow('metadata server not ready');
    await expect(identity.impersonate('a@x')).resolves.toBeDefined();
    expect(GoogleAuth).toHaveBeenCalledTimes(1);
  });

  it('builds a BigQuery client that authenticates as the storage account', async () => {
    const identity = new OwoxStorageIdentity();
    const ownClient = { own: true };
    const impersonated = { impersonated: true };
    getClient.mockResolvedValue(ownClient);
    (Impersonated as unknown as jest.Mock).mockImplementation(() => impersonated);
    await identity.bigQueryAs('a@x', 'proj', 'EU');
    const options = (BigQuery as unknown as jest.Mock).mock.calls.at(-1)[0];
    expect(options).toEqual({ projectId: 'proj', location: 'EU', authClient: impersonated });
    expect(options.authClient).toBe(impersonated);
    expect(options.authClient).not.toBe(ownClient);
  });
});
