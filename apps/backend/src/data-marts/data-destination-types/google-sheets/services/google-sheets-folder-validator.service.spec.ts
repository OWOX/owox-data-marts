const mockGetFolderAccess = jest.fn();

jest.mock('../adapters/google-sheets-api.adapter', () => {
  const ctor = jest.fn().mockImplementation(() => ({
    getFolderAccess: (...args: unknown[]) => mockGetFolderAccess(...args),
  }));
  (ctor as unknown as Record<string, unknown>).createServiceAccountClient = jest.fn(() => ({}));
  (ctor as unknown as Record<string, unknown>).SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES = ['a', 'b'];
  return { GoogleSheetsApiAdapter: ctor };
});

import { GoogleSheetsFolderValidator } from './google-sheets-folder-validator.service';
import { DestinationCredentialType } from '../../../enums/destination-credential-type.enum';
import { DestinationFolderAccessException } from '../../../exceptions/google-oauth.exceptions';

const VALID_SA_KEY = {
  type: 'service_account',
  project_id: 'proj',
  private_key_id: 'kid',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@proj.iam.gserviceaccount.com',
  client_id: '123',
  client_x509_cert_url: 'https://example.com/cert',
};

const SA_CREDENTIAL = {
  id: 'cred-1',
  type: DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT,
  credentials: { type: 'google-sheets-credentials', serviceAccountKey: VALID_SA_KEY },
};

describe('GoogleSheetsFolderValidator', () => {
  const createValidator = (credential: unknown) => {
    const credentialService = { getById: jest.fn().mockResolvedValue(credential) };
    const validator = new GoogleSheetsFolderValidator(credentialService as never);
    return { validator, credentialService };
  };

  const destination = (
    config: { folderId?: string } | null,
    credentialId: string | null = 'cred-1'
  ) => ({ id: 'dest-1', credentialId, config }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFolderAccess.mockResolvedValue({
      accessible: true,
      isFolder: true,
      isSharedDrive: true,
      canAddChildren: true,
    });
  });

  it('passes for an accessible shared-drive folder the SA can write to', async () => {
    const { validator } = createValidator(SA_CREDENTIAL);
    await expect(
      validator.validateConfiguredFolder(destination({ folderId: 'f1' }))
    ).resolves.toBeUndefined();
    expect(mockGetFolderAccess).toHaveBeenCalledWith('f1');
  });

  it('is a no-op when no folder is configured', async () => {
    const { validator, credentialService } = createValidator(SA_CREDENTIAL);
    await validator.validateConfiguredFolder(destination(null));
    expect(credentialService.getById).not.toHaveBeenCalled();
    expect(mockGetFolderAccess).not.toHaveBeenCalled();
  });

  it('is a no-op for non-service-account (OAuth) credentials', async () => {
    const { validator } = createValidator({
      id: 'cred-1',
      type: DestinationCredentialType.GOOGLE_OAUTH,
      credentials: {},
    });
    await validator.validateConfiguredFolder(destination({ folderId: 'f1' }));
    expect(mockGetFolderAccess).not.toHaveBeenCalled();
  });

  it('throws when the folder is not accessible', async () => {
    const { validator } = createValidator(SA_CREDENTIAL);
    mockGetFolderAccess.mockResolvedValue({
      accessible: false,
      isFolder: false,
      isSharedDrive: false,
      canAddChildren: false,
    });
    await expect(
      validator.validateConfiguredFolder(destination({ folderId: 'f1' }))
    ).rejects.toThrow(DestinationFolderAccessException);
  });

  it('throws when the folder is not in a Shared Drive', async () => {
    const { validator } = createValidator(SA_CREDENTIAL);
    mockGetFolderAccess.mockResolvedValue({
      accessible: true,
      isFolder: true,
      isSharedDrive: false,
      canAddChildren: true,
    });
    await expect(
      validator.validateConfiguredFolder(destination({ folderId: 'f1' }))
    ).rejects.toThrow(DestinationFolderAccessException);
  });

  it('throws when the service account cannot add files to the folder', async () => {
    const { validator } = createValidator(SA_CREDENTIAL);
    mockGetFolderAccess.mockResolvedValue({
      accessible: true,
      isFolder: true,
      isSharedDrive: true,
      canAddChildren: false,
    });
    await expect(
      validator.validateConfiguredFolder(destination({ folderId: 'f1' }))
    ).rejects.toThrow(DestinationFolderAccessException);
  });
});
