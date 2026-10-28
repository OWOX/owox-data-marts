jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import * as jwt from 'jsonwebtoken';
import {
  GOOGLE_OAUTH_ENV,
  GOOGLE_TOKENS,
  REDIRECT_URI,
  googleOAuthFlow,
  stubGoogleConsent,
} from '../../../../test/fixtures/google-oauth';
import { InvalidOAuthStateException } from '../../exceptions/google-oauth.exceptions';
import * as builtinDefinitions from '../services/builtin-credential-definitions';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { ConnectGoogleOAuthCredentialService } from './connect-google-oauth-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const storedTokens = {
  access_token: GOOGLE_TOKENS.access_token,
  refresh_token: GOOGLE_TOKENS.refresh_token,
  token_type: GOOGLE_TOKENS.token_type,
  scope: GOOGLE_TOKENS.scope,
  expiry_date: GOOGLE_TOKENS.expiry_date,
};

function existingGoogleCredential() {
  return {
    id: 'credential-1',
    title: 'Warehouse',
    secret: {
      oauth: {
        provider: 'google',
        clientId: 'storage-client-id',
        tokens: {
          access_token: 'old',
          refresh_token: 'old-refresh',
          token_type: 'Bearer',
          scope: '',
        },
      },
    },
    publicMetadata: {
      account: { email: 'Analyst@Example.com', name: null, picture: null },
      scopes: [],
    },
    validationState: 'rejected',
  };
}

function setup({ canEdit = true, existing = existingGoogleCredential() as object } = {}) {
  const { flow } = googleOAuthFlow();
  const credentials = {
    createWithAccess: jest.fn((value: object) => Promise.resolve({ id: 'credential-1', ...value })),
    save: jest.fn((value: object) => Promise.resolve(value)),
    getByIdAndProjectId: jest.fn().mockResolvedValue(existing),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(canEdit) };
  const view = { build: jest.fn().mockResolvedValue({ id: 'credential-1' }) };
  const service = new ConnectGoogleOAuthCredentialService(
    flow,
    credentials as never,
    new CredentialDefinitionService({} as never, {} as never),
    access as never,
    view as never
  );
  const stateFor = async (
    credentialId?: string,
    projectId = 'project-1',
    type = 'credential',
    definitionId?: string
  ) =>
    (
      await flow.generateAuthorizationUrl(
        type as 'credential',
        projectId,
        credentialId,
        REDIRECT_URI,
        definitionId
      )
    ).state;
  return { service, credentials, access, stateFor };
}

describe('ConnectGoogleOAuthCredentialService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a verified Google account Credential titled by the email and owned by the member', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent();

    await service.run(context, {
      code: 'code-1',
      state: await stateFor(),
      ownerIds: ['member-2'],
    });

    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        title: 'analyst@example.com',
        definitionSource: 'builtin',
        definitionId: 'google-oauth',
        secret: {
          oauth: { provider: 'google', clientId: 'storage-client-id', tokens: storedTokens },
        },
        publicMetadata: {
          account: { email: 'analyst@example.com', name: 'Ana Lyst', picture: null },
          scopes: ['https://www.googleapis.com/auth/bigquery', 'openid', 'email'],
        },
        validationState: 'verified',
        enabled: true,
        availableForUse: true,
        availableForMaintenance: false,
      }),
      { createdBy: context, ownerIds: ['member-2'], contextIds: [] }
    );
  });

  it('creates the Credential with the definition its state names', async () => {
    const real = builtinDefinitions.builtinOAuthAuth;
    jest
      .spyOn(builtinDefinitions, 'builtinOAuthAuth')
      .mockImplementation(id => real(id === 'google-oauth-drive' ? 'google-oauth' : id));
    jest.spyOn(CredentialDefinitionService.prototype, 'get').mockResolvedValue({
      source: 'builtin',
      definitionId: 'google-oauth-drive',
      compatibilityLine: null,
    } as never);
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent();

    await service.run(context, {
      code: 'code-1',
      state: await stateFor(undefined, 'project-1', 'credential', 'google-oauth-drive'),
    });

    expect(CredentialDefinitionService.prototype.get).toHaveBeenCalledWith('google-oauth-drive');
    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({ definitionId: 'google-oauth-drive' }),
      expect.anything()
    );
  });

  it('honours availableForUse: false and a given title', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent();

    await service.run(context, {
      code: 'code-1',
      state: await stateFor(),
      title: ' BigQuery analyst ',
      availableForUse: false,
    });

    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'BigQuery analyst', availableForUse: false }),
      expect.anything()
    );
  });

  it('reconnects the same account into the Credential, keeping its title', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent({ email: 'analyst@example.com' });

    await service.run(context, { code: 'code-1', state: await stateFor('credential-1') });

    expect(credentials.createWithAccess).not.toHaveBeenCalled();
    expect(credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Warehouse',
        secret: {
          oauth: { provider: 'google', clientId: 'storage-client-id', tokens: storedTokens },
        },
        validationState: 'verified',
      })
    );
  });

  it('reconnect records the newly granted scopes', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent({ email: 'analyst@example.com' });

    await service.run(context, { code: 'code-1', state: await stateFor('credential-1') });

    expect(credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: expect.objectContaining({
          scopes: ['https://www.googleapis.com/auth/bigquery', 'openid', 'email'],
        }),
      })
    );
  });

  it('reconnect of a Credential with no recorded email accepts the account and records it', async () => {
    const converted = existingGoogleCredential();
    converted.publicMetadata.account.email = '';
    const { service, credentials, stateFor } = setup({ existing: converted });
    stubGoogleConsent({ email: 'analyst@example.com' });

    await service.run(context, { code: 'code-1', state: await stateFor('credential-1') });

    expect(credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publicMetadata: expect.objectContaining({
          account: expect.objectContaining({ email: 'analyst@example.com' }),
        }),
      })
    );
  });

  it('refuses a reconnect with another Google account', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent({ email: 'someone-else@example.com' });

    await expect(
      service.run(context, { code: 'code-1', state: await stateFor('credential-1') })
    ).rejects.toThrow(
      new BadRequestException(
        'Connect the same Google account (Analyst@Example.com), or create a new Credential.'
      )
    );
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a reconnect without EDIT on the Credential', async () => {
    const { service, credentials, stateFor } = setup({ canEdit: false });
    stubGoogleConsent();

    await expect(
      service.run(context, { code: 'code-1', state: await stateFor('credential-1') })
    ).rejects.toThrow(ForbiddenException);
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a state from another project before asking Google', async () => {
    const { service, credentials, stateFor } = setup();
    const { getToken } = stubGoogleConsent();

    await expect(
      service.run(context, { code: 'code-1', state: await stateFor(undefined, 'project-2') })
    ).rejects.toThrow(ForbiddenException);
    expect(getToken).not.toHaveBeenCalled();
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a Storage state', async () => {
    const { service, credentials, stateFor } = setup();
    stubGoogleConsent();

    await expect(
      service.run(context, {
        code: 'code-1',
        state: await stateFor(undefined, 'project-1', 'storage'),
      })
    ).rejects.toThrow(InvalidOAuthStateException);
    expect(credentials.save).not.toHaveBeenCalled();
  });

  it('refuses a Credential state that names no definition before asking Google', async () => {
    const { service, credentials } = setup();
    const { getToken } = stubGoogleConsent();
    const state = jwt.sign(
      { projectId: 'project-1', type: 'credential', redirectUri: REDIRECT_URI },
      GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_JWT_SECRET
    );

    await expect(service.run(context, { code: 'code-1', state })).rejects.toThrow(
      InvalidOAuthStateException
    );
    expect(getToken).not.toHaveBeenCalled();
    expect(credentials.createWithAccess).not.toHaveBeenCalled();
  });
});
