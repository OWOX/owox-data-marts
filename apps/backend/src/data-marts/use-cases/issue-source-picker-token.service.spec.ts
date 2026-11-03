jest.mock('../services/connector/connector-preview-support', () => ({
  ...jest.requireActual('../services/connector/connector-preview-support'),
  createConnectorPreviewSource: jest.fn(),
}));

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { SourceCredentialUnavailableException } from '../exceptions/source-credential-unavailable.exception';
import { Action, EntityType } from '../services/access-decision';
import { createConnectorPreviewSource } from '../services/connector/connector-preview-support';
import { SourceCredentialInjectorService } from '../services/connector/source-credential-injector.service';
import { IssueSourcePickerTokenService } from './issue-source-picker-token.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const OTHER_SIGNER =
  'Spreadsheets for this Credential are added by the person who connected its Google account. Connect your own Google account to add one.';

const NOT_RECORDED = 'Ask a member who can edit this Credential to reconnect it.';

/** Jest compares errors by message only, so the class and status are checked too. */
async function expectRefusal(promise: Promise<unknown>, expected: HttpException) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(expected.constructor);
  expect((error as HttpException).getStatus()).toBe(expected.getStatus());
  expect(error).toEqual(expected);
}

function setup(
  options: {
    definitionId?: string;
    signer?: string;
    canEdit?: boolean;
    canSee?: boolean;
    userId?: string;
  } = {}
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
  const resolved = {
    credentialId: 'credential-1',
    definitionId: credential.definitionId,
    publicMetadata: credential.publicMetadata,
  };
  const credentials = { getByIdAndProjectId: jest.fn().mockResolvedValue(credential) };
  const access = {
    canAccess: jest.fn((...args: unknown[]) =>
      Promise.resolve(args[4] === Action.SEE ? (options.canSee ?? true) : (options.canEdit ?? true))
    ),
  };
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

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new ForbiddenException(OTHER_SIGNER)
    );
    expect(sourceCredentials.resolveCredential).not.toHaveBeenCalled();
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses the signer without EDIT with the edit-access copy', async () => {
    const { service, source } = setup({ canEdit: false });

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new ForbiddenException('You need edit access to this Credential to add spreadsheets.')
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('asks a member with EDIT to reconnect a Credential with no recorded signer', async () => {
    const { service, source } = setup({ signer: undefined });

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new ForbiddenException('Reconnect this Credential to add spreadsheets.')
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a member without EDIT on a Credential with no recorded signer', async () => {
    const { service, source } = setup({ signer: undefined, canEdit: false });

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new ForbiddenException(NOT_RECORDED)
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('answers the same 404 for a Credential the member cannot see, before its type', async () => {
    const { service, source, credentials } = setup({
      definitionId: 'google-service-account',
      canSee: false,
    });
    const notFound = new NotFoundException('Credential credential-1 was not found');
    credentials.getByIdAndProjectId.mockRejectedValueOnce(notFound);

    await expect(service.run(context, 'GoogleSheets', 'credential-1')).rejects.toBe(notFound);
    await expectRefusal(service.run(context, 'GoogleSheets', 'credential-1'), notFound);
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses when a reconnect by another member lands before the grant is read', async () => {
    const { service, source, sourceCredentials, resolved } = setup();
    sourceCredentials.resolveCredential.mockResolvedValue({
      ...resolved,
      publicMetadata: {
        fields: {},
        connection: { account: null, expiresAt: null, signedInByUserId: 'member-2' },
      },
    });

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new ForbiddenException(OTHER_SIGNER)
    );
    expect(source.getAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a Credential whose connector opens no Picker', async () => {
    const { service, source, access } = setup({ definitionId: 'google-service-account' });

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new BadRequestException('Credential credential-1 does not open Google Picker')
    );
    await expect(setup().service.run(context, 'GoogleAds', 'credential-1')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(access.canAccess).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      EntityType.CREDENTIAL,
      'credential-1',
      Action.EDIT,
      'project-1'
    );
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

    await expectRefusal(
      service.run(context, 'GoogleSheets', 'credential-1'),
      new BadRequestException('Connector credentials are invalid or expired')
    );
  });

  it('refreshes through the real Google Sheets source with the Credential values', async () => {
    const { service, sourceCredentials, resolved } = setup();
    sourceCredentials.resolveCredential.mockResolvedValue({
      ...resolved,
      secret: { fields: { RefreshToken: 'refresh-1', ClientSecret: 'cs-1' } },
      publicMetadata: { ...resolved.publicMetadata, fields: { ClientId: 'client-1' } },
    });
    const real = new SourceCredentialInjectorService(
      null as never,
      null as never,
      null as never,
      null as never
    );
    Object.assign(service, { injector: real });
    const actual = jest.requireActual<
      typeof import('../services/connector/connector-preview-support')
    >('../services/connector/connector-preview-support');
    jest
      .mocked(createConnectorPreviewSource)
      .mockImplementation(actual.createConnectorPreviewSource);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access_token: 'google-token' }),
    } as Response);

    try {
      expect(await service.run(context, 'GoogleSheets', 'credential-1')).toEqual({
        accessToken: 'google-token',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://oauth2.googleapis.com/token');
      expect(new URLSearchParams(String(init?.body)).get('refresh_token')).toBe('refresh-1');
      expect(new URLSearchParams(String(init?.body)).get('client_id')).toBe('client-1');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
