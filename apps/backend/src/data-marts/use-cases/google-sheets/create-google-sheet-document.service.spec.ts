const mockCreateSpreadsheet = jest.fn();
const mockCreateSpreadsheetViaDrive = jest.fn();
const mockCreateSpreadsheetInFolder = jest.fn();
const mockCreateServiceAccountClient = jest.fn(() => ({}));
const mockShareFileWithUser = jest.fn();

jest.mock('../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter', () => {
  const ctor = jest.fn().mockImplementation(() => ({
    createSpreadsheet: (...args: unknown[]) => mockCreateSpreadsheet(...args),
    createSpreadsheetViaDrive: (...args: unknown[]) => mockCreateSpreadsheetViaDrive(...args),
    createSpreadsheetInFolder: (...args: unknown[]) => mockCreateSpreadsheetInFolder(...args),
    shareFileWithUser: (...args: unknown[]) => mockShareFileWithUser(...args),
  }));
  (ctor as unknown as Record<string, unknown>).createServiceAccountClient = (...args: unknown[]) =>
    mockCreateServiceAccountClient(...args);
  (ctor as unknown as Record<string, unknown>).SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ];
  // Mirror the real static helper so the service can classify folder-create errors.
  (ctor as unknown as Record<string, unknown>).httpStatusOf = (error: unknown) => {
    const e = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
    for (const c of [e?.response?.status, e?.status, e?.code]) {
      if (typeof c === 'number') return c;
      if (typeof c === 'string' && /^\d+$/.test(c)) return Number(c);
    }
    return undefined;
  };
  return { GoogleSheetsApiAdapter: ctor };
});

import { BadRequestException } from '@nestjs/common';
import { CreateGoogleSheetDocumentService } from './create-google-sheet-document.service';
import { CreateGoogleSheetDocumentCommand } from '../../dto/domain/google-sheets/create-google-sheet-document.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  CredentialsNotFoundException,
  GoogleApiException,
  OAuthNotConnectedException,
  ServiceAccountRequiresFolderException,
  SheetFolderCreateFailedException,
} from '../../exceptions/google-oauth.exceptions';

const VALID_SA_KEY = {
  type: 'service_account',
  project_id: 'proj',
  private_key_id: 'kid',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@proj.iam.gserviceaccount.com',
  client_id: '123',
  client_x509_cert_url: 'https://example.com/cert',
};

const OAUTH_SCOPE_WITH_DRIVE_FILE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const OAUTH_SCOPE_NO_DRIVE = 'https://www.googleapis.com/auth/spreadsheets';

describe('CreateGoogleSheetDocumentService', () => {
  const buildDestination = (
    credentialType?: DestinationCredentialType,
    config?: { folderId?: string },
    oauthScope?: string
  ) => ({
    id: 'dest-1',
    type: DataDestinationType.GOOGLE_SHEETS,
    credential: credentialType
      ? {
          id: 'cred-1',
          type: credentialType,
          credentials: oauthScope !== undefined ? { scope: oauthScope } : {},
        }
      : null,
    config: config ?? null,
  });

  const createService = (destination: unknown, resolverValue?: unknown, idpUserEmail?: string) => {
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(destination),
    };
    const googleOAuthClientService = {
      getDestinationOAuth2Client: jest.fn().mockResolvedValue({}),
    };
    const credentialsResolver = {
      resolve: jest.fn().mockResolvedValue(resolverValue),
    };
    const idpProjectionsFacade = {
      getUserProjection: jest
        .fn()
        .mockResolvedValue(idpUserEmail ? { email: idpUserEmail } : undefined),
    };
    const service = new CreateGoogleSheetDocumentService(
      dataDestinationService as never,
      googleOAuthClientService as never,
      credentialsResolver as never,
      idpProjectionsFacade as never
    );
    return {
      service,
      dataDestinationService,
      googleOAuthClientService,
      credentialsResolver,
      idpProjectionsFacade,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSpreadsheet.mockResolvedValue({ spreadsheetId: 'sheet-id', sheetId: 0 });
    mockCreateSpreadsheetViaDrive.mockResolvedValue({ spreadsheetId: 'sheet-id', sheetId: 0 });
    mockCreateSpreadsheetInFolder.mockResolvedValue({ spreadsheetId: 'sa-sheet-id', sheetId: 0 });
    mockCreateServiceAccountClient.mockReturnValue({});
    mockShareFileWithUser.mockResolvedValue(undefined);
  });

  it('creates a sheet via the OAuth client for an OAuth destination', async () => {
    const { service, googleOAuthClientService } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_OAUTH)
    );

    const result = await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'Revenue')
    );

    expect(googleOAuthClientService.getDestinationOAuth2Client).toHaveBeenCalledWith('dest-1');
    expect(mockCreateSpreadsheet).toHaveBeenCalledWith('Revenue');
    expect(mockCreateSpreadsheetViaDrive).not.toHaveBeenCalled();
    expect(mockCreateSpreadsheetInFolder).not.toHaveBeenCalled();
    expect(result).toEqual({ spreadsheetId: 'sheet-id', sheetId: 0 });
  });

  it('falls back to a default title when none is provided', async () => {
    const { service } = createService(buildDestination(DestinationCredentialType.GOOGLE_OAUTH));

    await service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', '   '));

    expect(mockCreateSpreadsheet).toHaveBeenCalledWith('OWOX Report');
  });

  it('creates a sheet in the configured folder via the Service Account', async () => {
    const { service, googleOAuthClientService } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, { folderId: 'folder-1' }),
      { type: 'google-sheets-credentials', serviceAccountKey: VALID_SA_KEY }
    );

    const result = await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'Report')
    );

    expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    expect(mockCreateServiceAccountClient).toHaveBeenCalled();
    expect(mockCreateSpreadsheetInFolder).toHaveBeenCalledWith('Report', 'folder-1');
    expect(result).toEqual({ spreadsheetId: 'sa-sheet-id', sheetId: 0 });
  });

  it('shares the created sheet with the requester (OAuth with drive.file scope)', async () => {
    const { service } = createService(
      buildDestination(
        DestinationCredentialType.GOOGLE_OAUTH,
        undefined,
        OAUTH_SCOPE_WITH_DRIVE_FILE
      )
    );

    await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2', 'bu@example.com')
    );

    expect(mockCreateSpreadsheetViaDrive).toHaveBeenCalledWith('R');
    expect(mockShareFileWithUser).toHaveBeenCalledWith('sheet-id', 'bu@example.com', 'writer');
  });

  it('creates in the picked folder via OAuth (drive.file) and shares it', async () => {
    const { service } = createService(
      buildDestination(
        DestinationCredentialType.GOOGLE_OAUTH,
        { folderId: 'folder-1' },
        OAUTH_SCOPE_WITH_DRIVE_FILE
      )
    );

    await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2', 'bu@example.com')
    );

    expect(mockCreateSpreadsheetInFolder).toHaveBeenCalledWith('R', 'folder-1');
    expect(mockCreateSpreadsheetViaDrive).not.toHaveBeenCalled();
    expect(mockShareFileWithUser).toHaveBeenCalledWith('sa-sheet-id', 'bu@example.com', 'writer');
  });

  it('skips sharing (but still creates) when the OAuth token lacks a Drive scope', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_OAUTH, undefined, OAUTH_SCOPE_NO_DRIVE)
    );

    const result = await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2', 'bu@example.com')
    );

    expect(result).toEqual({ spreadsheetId: 'sheet-id', sheetId: 0 });
    expect(mockCreateSpreadsheet).toHaveBeenCalled();
    expect(mockCreateSpreadsheetViaDrive).not.toHaveBeenCalled();
    expect(mockShareFileWithUser).not.toHaveBeenCalled();
  });

  it('shares the SA-created sheet with the requester (SA always has Drive scope)', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, { folderId: 'folder-1' }),
      { type: 'google-sheets-credentials', serviceAccountKey: VALID_SA_KEY }
    );

    await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2', 'bu@example.com')
    );

    expect(mockShareFileWithUser).toHaveBeenCalledWith('sa-sheet-id', 'bu@example.com', 'writer');
  });

  it('resolves the requester email via the IDP when the command has none', async () => {
    const { service, idpProjectionsFacade } = createService(
      buildDestination(
        DestinationCredentialType.GOOGLE_OAUTH,
        undefined,
        OAUTH_SCOPE_WITH_DRIVE_FILE
      ),
      undefined,
      'idp@example.com'
    );

    await service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2'));

    expect(idpProjectionsFacade.getUserProjection).toHaveBeenCalledWith('user-2');
    expect(mockShareFileWithUser).toHaveBeenCalledWith('sheet-id', 'idp@example.com', 'writer');
  });

  it('does not fail creation when sharing fails (best-effort)', async () => {
    const { service } = createService(
      buildDestination(
        DestinationCredentialType.GOOGLE_OAUTH,
        undefined,
        OAUTH_SCOPE_WITH_DRIVE_FILE
      )
    );
    mockShareFileWithUser.mockRejectedValue(new Error('permission denied'));

    const result = await service.run(
      new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'R', 'user-2', 'bu@example.com')
    );

    expect(result).toEqual({ spreadsheetId: 'sheet-id', sheetId: 0 });
  });

  it('rejects a Service Account destination with no folder configured', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT)
    );

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(ServiceAccountRequiresFolderException);
    expect(mockCreateSpreadsheetInFolder).not.toHaveBeenCalled();
  });

  it('wraps Drive-create failures in SheetFolderCreateFailedException', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, { folderId: 'folder-1' }),
      { type: 'google-sheets-credentials', serviceAccountKey: VALID_SA_KEY }
    );
    mockCreateSpreadsheetInFolder.mockRejectedValue(new Error('403 from Drive'));

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(SheetFolderCreateFailedException);
  });

  it('surfaces a transient Drive error as GoogleApiException, not a folder error', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, { folderId: 'folder-1' }),
      { type: 'google-sheets-credentials', serviceAccountKey: VALID_SA_KEY }
    );
    // Gaxios-shaped transient error (503) — must NOT be reported as a folder problem.
    mockCreateSpreadsheetInFolder.mockRejectedValue(
      Object.assign(new Error('backend error'), { response: { status: 503 } })
    );

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(GoogleApiException);
  });

  it('rejects a Service Account destination whose SA key is missing/invalid', async () => {
    const { service } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT, { folderId: 'folder-1' }),
      { type: 'google-sheets-credentials' } // no serviceAccountKey
    );

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(BadRequestException);
  });

  it('throws OAuthNotConnected when the destination has no credential', async () => {
    const { service } = createService(buildDestination(undefined));

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(OAuthNotConnectedException);
  });

  it('maps a missing OAuth credential to OAuthNotConnected', async () => {
    const { service, googleOAuthClientService } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_OAUTH)
    );
    googleOAuthClientService.getDestinationOAuth2Client.mockRejectedValue(
      new CredentialsNotFoundException('dest-1', 'destination')
    );

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(OAuthNotConnectedException);
  });

  it('rejects a non-Google-Sheets destination', async () => {
    const { service } = createService({
      id: 'dest-1',
      type: DataDestinationType.LOOKER_STUDIO,
      credential: { id: 'cred-1', type: DestinationCredentialType.GOOGLE_OAUTH },
      config: null,
    });

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(BadRequestException);
  });
});
