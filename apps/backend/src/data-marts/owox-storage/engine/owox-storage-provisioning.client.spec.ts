import { fetchWithBackoff } from '@owox/internal-helpers';
import { OwoxStorageProvisioningClient } from './owox-storage-provisioning.client';

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: jest.fn().mockResolvedValue('id-token'),
  })),
}));

const fetchMock = fetchWithBackoff as jest.MockedFunction<typeof fetchWithBackoff>;

const ENV: Record<string, string> = {
  BALANCE_ENDPOINT_BASE_URL: 'https://ib.example/internal-api/bi-project/',
  BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT: 'c2c@secure.iam.gserviceaccount.com',
  BALANCE_ENDPOINT_TARGET_AUDIENCE: 'integrated-backend/api',
};

const CREATED = {
  gcpProjectId: 'owox-gcp',
  datasetId: 'owox_abcdef012345',
  internalDatasetId: 'owox_abcdef012345_internal',
  location: 'US',
  serviceAccountEmail: 'owox-st-abcdef012345@owox-storage-sa.iam.gserviceaccount.com',
};

const client = (env: Record<string, string> = ENV) =>
  new OwoxStorageProvisioningClient({ get: (name: string) => env[name] } as never);

const respond = (status: number, body?: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(body === undefined ? null : JSON.stringify(body), { status })
  );

describe('OwoxStorageProvisioningClient', () => {
  beforeEach(() => fetchMock.mockReset());

  it('PUTs the location to the project dataset path with the C2C token', async () => {
    respond(200, CREATED);

    const result = await client().provision('p 1', 'owox_abcdef012345', 'US');

    expect(result).toEqual(CREATED);
    const [url, init, timeout] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ib.example/internal-api/bi-project/p%201/owox-storage/datasets/owox_abcdef012345'
    );
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer id-token',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(JSON.stringify({ location: 'US' }));
    expect(timeout).toBe(40_000);
  });

  it('DELETEs the datasets without a body', async () => {
    respond(204);

    await client().deprovision('p1', 'owox_abcdef012345');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ib.example/internal-api/bi-project/p1/owox-storage/datasets/owox_abcdef012345'
    );
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('throws on an error status without the response body', async () => {
    respond(503, { message: 'project owox-secret-gcp is not configured' });

    const error = await client()
      .deprovision('p1', 'owox_abcdef012345')
      .catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Integrated Backend answered 503 to OWOX Storage DELETE');
    // describeGoogleError logs the code, so ops can tell a 409 from a 502.
    expect((error as { code?: number }).code).toBe(503);
  });

  it('rejects a response without a service account', async () => {
    respond(200, { ...CREATED, serviceAccountEmail: '' });

    await expect(client().provision('p1', 'owox_abcdef012345', 'US')).rejects.toThrow();
  });

  it('refuses to call without the Integrated Backend endpoint', async () => {
    await expect(client({}).provision('p1', 'owox_abcdef012345', 'US')).rejects.toThrow(
      'BALANCE_ENDPOINT_'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
