jest.mock('../services/connector/connector-preview-support', () => ({
  ...jest.requireActual('../services/connector/connector-preview-support'),
  createConnectorPreviewSource: jest.fn(),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { SourceCredentialUnavailableException } from '../exceptions/source-credential-unavailable.exception';
import { Action, EntityType } from '../services/access-decision';
import { createConnectorPreviewSource } from '../services/connector/connector-preview-support';
import { IssueSourcePickerTokenService } from './issue-source-picker-token.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const OTHER_SIGNER =
  'Spreadsheets for this Credential are added by the person who connected its Google account. Connect your own Google account to add one.';

function setup(
  options: { definitionId?: string; signer?: string; canEdit?: boolean; userId?: string } = {}
) {
  const credential = {
    id: 'credential-1',
    definitionId: options.definitionId ?? 'source:GoogleSheets:oauth2',
    publicMetadata: {
      fields: {},
      connection: {
        account: null,
        expiresAt: null,
        signedInByUserId: 'signer' in options ? options.signer : 'member-1',
      },
    },
  };
  const resolved = { credentialId: 'credential-1', definitionId: credential.definitionId };
  const credentials = { getByIdAndProjectId: jest.fn().mockResolvedValue(credential) };
  const access = { canAccess: jest.fn().mockResolvedValue(options.canEdit ?? true) };
  const sourceCredentials = { resolveCredential: jest.fn().mockResolvedValue(resolved) };
  const injector = {
    previewBoundConfig: jest.fn().mockReturnValue({ AuthType: { oauth2: {} } }),
  };
  const source = { getAccessToken: jest.fn().mockResolvedValue('fresh-token') };
  jest.mocked(createConnectorPreviewSource).mockReturnValue(source as never);
  const service = new IssueSourcePickerTokenService(
    credentials as never,
    access as never,
    sourceCredentials as never,
    injector as never
  );
  return { service, resolved, credentials, access, sourceCredentials, injector, source };
}

describe('IssueSourcePickerTokenService', () => {
  it("returns the token the connector refreshes from the Credential's refresh token", async () => {
    const { service, resolved, injector, access, credentials } = setup();

    expect(await service.run(context, 'GoogleSheets', 'credential-1')).toEqual({
      accessToken: 'fresh-token',
    });
    expect(credentials.getByIdAndProjectId).toHaveBeenCalledWith('credential-1', 'project-1');
    expect(access.canAccess).toHaveBeenCalledWith(
      'member-1',
      ['editor'],
      EntityType.CREDENTIAL,
      'credential-1',
      Action.EDIT,
      'project-1'
    );
    expect(injector.previewBoundConfig).toHaveBeenCalledWith({}, 'GoogleSheets', resolved);
    expect(createConnectorPreviewSource).toHaveBeenCalledWith(
      'GoogleSheets',
      { AuthType: { oauth2: {} } },
      expect.anything()
    );
  });

  it('refuses another member with the 403 copy, before any refresh', async () => {
    const { service, source, sourceCredentials } = setup({ signer: 'member-2' });

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new ForbiddenException(OTHER_SIGNER)
    );
    expect(sourceCredentials.resolveCredential).not.toHaveBeenCalled();
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses the signer without EDIT with the edit-access copy', async () => {
    const { service, source } = setup({ canEdit: false });

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new ForbiddenException('You need edit access to this Credential to add spreadsheets.')
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('asks a member with EDIT to reconnect a Credential with no recorded signer', async () => {
    const { service, source } = setup({ signer: undefined });

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new ForbiddenException('Reconnect this Credential to add spreadsheets.')
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a member without EDIT on a Credential with no recorded signer', async () => {
    const { service, source } = setup({ signer: undefined, canEdit: false });

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new ForbiddenException(OTHER_SIGNER)
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a Credential whose connector opens no Picker', async () => {
    const { service, source, access } = setup({ definitionId: 'google-service-account' });

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new BadRequestException('Credential credential-1 does not open Google Picker')
    );
    await expect(setup().service.run(context, 'GoogleAds', 'credential-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(access.canAccess).not.toHaveBeenCalled();
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a disabled Credential', async () => {
    const { service, sourceCredentials, source } = setup();
    const disabled = new SourceCredentialUnavailableException('disabled');
    sourceCredentials.resolveCredential.mockRejectedValue(disabled);

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toBe(disabled);
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('answers 400 when Google rejects the refresh token', async () => {
    const { service, source } = setup();
    source.getAccessToken.mockRejectedValue(new Error('Token error: invalid_grant'));

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toEqual(
      new BadRequestException('Connector credentials are invalid or expired')
    );
  });
});
