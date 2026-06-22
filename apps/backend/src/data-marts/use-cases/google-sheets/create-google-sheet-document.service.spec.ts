const mockCreateSpreadsheet = jest.fn();

jest.mock('../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter', () => ({
  GoogleSheetsApiAdapter: jest.fn().mockImplementation(() => ({
    createSpreadsheet: (...args: unknown[]) => mockCreateSpreadsheet(...args),
  })),
}));

import { BadRequestException } from '@nestjs/common';
import { CreateGoogleSheetDocumentService } from './create-google-sheet-document.service';
import { CreateGoogleSheetDocumentCommand } from '../../dto/domain/google-sheets/create-google-sheet-document.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  CredentialsNotFoundException,
  OAuthNotConnectedException,
  ServiceAccountRequiresFolderException,
} from '../../exceptions/google-oauth.exceptions';

describe('CreateGoogleSheetDocumentService', () => {
  const buildDestination = (credentialType?: DestinationCredentialType) => ({
    id: 'dest-1',
    type: DataDestinationType.GOOGLE_SHEETS,
    credential: credentialType ? { id: 'cred-1', type: credentialType } : null,
  });

  const createService = (destination: unknown) => {
    const dataDestinationService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(destination),
    };
    const googleOAuthClientService = {
      getDestinationOAuth2Client: jest.fn().mockResolvedValue({}),
    };
    const service = new CreateGoogleSheetDocumentService(
      dataDestinationService as never,
      googleOAuthClientService as never
    );
    return { service, dataDestinationService, googleOAuthClientService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSpreadsheet.mockResolvedValue({ spreadsheetId: 'sheet-id', sheetId: 0 });
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
    expect(result).toEqual({ spreadsheetId: 'sheet-id', sheetId: 0 });
  });

  it('falls back to a default title when none is provided', async () => {
    const { service } = createService(buildDestination(DestinationCredentialType.GOOGLE_OAUTH));

    await service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', '   '));

    expect(mockCreateSpreadsheet).toHaveBeenCalledWith('OWOX Report');
  });

  it('rejects a Service Account destination (folder required, later phase)', async () => {
    const { service, googleOAuthClientService } = createService(
      buildDestination(DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT)
    );

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(ServiceAccountRequiresFolderException);
    expect(googleOAuthClientService.getDestinationOAuth2Client).not.toHaveBeenCalled();
    expect(mockCreateSpreadsheet).not.toHaveBeenCalled();
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
    });

    await expect(
      service.run(new CreateGoogleSheetDocumentCommand('dest-1', 'proj-1', 'X'))
    ).rejects.toThrow(BadRequestException);
  });
});
