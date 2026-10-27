const mockCreateServiceAccountClient = jest.fn((..._args: unknown[]) => ({ jwt: true }));

jest.mock('./google-sheets-api.adapter', () => {
  const ctor = jest.fn().mockImplementation((credentials: unknown, authClient: unknown) => ({
    credentials,
    authClient,
  }));
  (ctor as unknown as Record<string, unknown>).createServiceAccountClient = (...args: unknown[]) =>
    mockCreateServiceAccountClient(...args);
  (ctor as unknown as Record<string, unknown>).SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES = [
    'drive-create',
  ];
  return { GoogleSheetsApiAdapter: ctor };
});

import { GoogleSheetsApiAdapterFactory } from './google-sheets-api-adapter.factory';
import { DestinationCredentialUnavailableException } from '../../../exceptions/destination-credential-unavailable.exception';

const SA_KEY = {
  type: 'service_account',
  project_id: 'proj',
  private_key_id: 'kid',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@proj.iam.gserviceaccount.com',
  client_id: '123',
  client_x509_cert_url: 'https://example.com/cert',
};
const SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';

describe('GoogleSheetsApiAdapterFactory', () => {
  const boundClient = { bound: true };
  const legacyClient = { legacy: true };
  const serviceAccount = {
    kind: 'service-account',
    credentials: { type: 'google-sheets-credentials', serviceAccountKey: SA_KEY },
  };
  const googleAccount = (scopes: string[]) => ({
    kind: 'google-account',
    client: boundClient,
    scopes,
  });

  const setup = (auth: unknown) => {
    const googleOAuthClientService = {
      getDestinationOAuth2Client: jest.fn().mockResolvedValue(legacyClient),
    };
    const credentialsResolver = { resolveAuth: jest.fn().mockResolvedValue(auth) };
    const factory = new GoogleSheetsApiAdapterFactory(
      googleOAuthClientService as never,
      credentialsResolver as never
    );
    return { factory, googleOAuthClientService, credentialsResolver };
  };

  // The old row of a Destination that has since been bound: never read.
  const destination = {
    id: 'dest-1',
    credential: { credentials: { scope: `${SHEETS} ${DRIVE_FILE}` } },
  } as never;

  const deleted = new DestinationCredentialUnavailableException(
    "This Destination's Credential was deleted. Select another Credential for this Destination.",
    false
  );

  beforeEach(() => jest.clearAllMocks());

  describe('createFromDestination', () => {
    it('builds the adapter from a bound service account Credential', async () => {
      const { factory, googleOAuthClientService, credentialsResolver } = setup(serviceAccount);

      const adapter = (await factory.createFromDestination(destination)) as never as {
        credentials: { serviceAccountKey: { client_email: string } };
      };

      expect(adapter.credentials.serviceAccountKey.client_email).toBe(SA_KEY.client_email);
      expect(credentialsResolver.resolveAuth).toHaveBeenCalledTimes(1);
      expect(credentialsResolver.resolveAuth).toHaveBeenCalledWith(destination, { markUsed: true });
      expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    });

    it('resolves without recording a use when asked not to', async () => {
      const { factory, credentialsResolver } = setup(serviceAccount);

      await factory.createFromDestination(destination, { markUsed: false });

      expect(credentialsResolver.resolveAuth).toHaveBeenCalledWith(destination, {
        markUsed: false,
      });
    });

    it('builds the adapter from the client of a bound Google account Credential', async () => {
      const { factory, googleOAuthClientService } = setup(googleAccount([SHEETS]));

      const adapter = await factory.createFromDestination(destination);

      expect(adapter).toEqual({ credentials: undefined, authClient: boundClient });
      expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    });

    it.each([
      ['an unavailable', new DestinationCredentialUnavailableException('Reconnect it.', true)],
      ['a deleted', deleted],
    ])(
      "hands %s bound Credential's error to the caller instead of falling back",
      async (_, error) => {
        const { factory, googleOAuthClientService, credentialsResolver } = setup(null);
        credentialsResolver.resolveAuth.mockRejectedValue(error);

        await expect(factory.createFromDestination(destination)).rejects.toBe(error);
        expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
      }
    );

    it("keeps today's path for an unbound Destination: old key, else the Destination's OAuth row", async () => {
      const { factory, googleOAuthClientService } = setup({ kind: 'unbound', credentials: null });

      const adapter = await factory.createFromDestination(destination);

      expect(adapter).toEqual({ credentials: undefined, authClient: legacyClient });
      expect(googleOAuthClientService.getDestinationOAuth2Client).toHaveBeenCalledWith('dest-1');
    });

    it("uses an unbound Destination's old service account key", async () => {
      const { factory, googleOAuthClientService } = setup({
        kind: 'unbound',
        credentials: serviceAccount.credentials,
      });

      const adapter = (await factory.createFromDestination(destination)) as never as {
        credentials: { serviceAccountKey: { client_email: string } };
      };

      expect(adapter.credentials.serviceAccountKey.client_email).toBe(SA_KEY.client_email);
      expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    });
  });

  describe('createWithDriveScope', () => {
    it("reads Drive capability from a bound Google account's granted scopes", async () => {
      const { factory, credentialsResolver } = setup(googleAccount([SHEETS]));

      // The old row says drive.file; the Credential's grant does not.
      await expect(factory.createWithDriveScope(destination)).resolves.toEqual({
        adapter: { credentials: undefined, authClient: boundClient },
        driveCapable: false,
      });

      credentialsResolver.resolveAuth.mockResolvedValue(googleAccount([SHEETS, DRIVE_FILE]));
      await expect(factory.createWithDriveScope(destination)).resolves.toMatchObject({
        driveCapable: true,
      });
    });

    it('mints a Drive-scoped client from a bound service account Credential', async () => {
      const { factory, googleOAuthClientService } = setup(serviceAccount);

      const result = await factory.createWithDriveScope(destination);

      expect(mockCreateServiceAccountClient).toHaveBeenCalledWith(
        expect.objectContaining({ client_email: SA_KEY.client_email }),
        ['drive-create']
      );
      expect(result).toEqual({
        adapter: { credentials: undefined, authClient: { jwt: true } },
        driveCapable: true,
      });
      expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    });

    it("hands a deleted bound Credential's error to the caller instead of falling back", async () => {
      const { factory, googleOAuthClientService, credentialsResolver } = setup(null);
      credentialsResolver.resolveAuth.mockRejectedValue(deleted);

      await expect(factory.createWithDriveScope(destination)).rejects.toBe(deleted);
      expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    });

    it("keeps reading an unbound Destination's OAuth row scopes", async () => {
      const { factory } = setup({ kind: 'unbound', credentials: {} });

      await expect(factory.createWithDriveScope(destination)).resolves.toEqual({
        adapter: { credentials: undefined, authClient: legacyClient },
        driveCapable: true,
      });
    });
  });
});
