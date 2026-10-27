jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));
jest.mock('../../../idp', () => ({
  ...jest.requireActual('../../../idp/decorators'),
  ...jest.requireActual('../../../idp/types'),
}));

import type { AuthorizationContext } from '../../../idp';
import { REJECT_API_KEY_AUTH_METADATA, REJECT_PLUGIN_AUTH_METADATA } from '../../../idp/decorators';
import {
  GOOGLE_OAUTH_ENV,
  GOOGLE_TOKENS,
  REDIRECT_URI,
  googleOAuthConfig,
  googleOAuthFlow,
  stubGoogleConsent,
} from '../../../../test/fixtures/google-oauth';
import { Credential } from '../entities/credential.entity';
import { CredentialMapper } from '../mappers/credential.mapper';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialViewService } from '../services/credential-view.service';
import { AuthorizeGoogleOAuthCredentialService } from '../use-cases/authorize-google-oauth-credential.service';
import { ConnectGoogleOAuthCredentialService } from '../use-cases/connect-google-oauth-credential.service';
import { CredentialsController } from './credentials.controller';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

/** Real flow, use cases, view and mapper; only Google and the database are stubbed. */
function setup() {
  const { flow } = googleOAuthFlow(googleOAuthConfig());
  let saved: Credential | undefined;
  const credentials = {
    save: jest.fn(async (value: Credential) => (saved = value)),
    createWithAccess: jest.fn(async (value: object) => {
      saved = Object.assign(
        new Credential(),
        { id: 'credential-1', owners: [], contexts: [] },
        value
      );
      return saved;
    }),
    getByIdAndProjectId: jest.fn(async () => saved),
    listBindings: jest.fn().mockResolvedValue([]),
    getLastUsedAt: jest.fn().mockResolvedValue(null),
  };
  const definitions = new CredentialDefinitionService({} as never, {} as never);
  const access = {
    canAccess: jest.fn().mockResolvedValue(true),
    canAccessMany: jest.fn().mockResolvedValue(new Map([['credential-1', true]])),
  };
  const mapper = new CredentialMapper({
    fetchUserProjectionsList: jest.fn().mockResolvedValue({ getByUserId: () => undefined }),
  } as never);
  const view = new CredentialViewService(
    definitions,
    credentials as never,
    mapper,
    access as never,
    { visibleTitles: jest.fn().mockResolvedValue(new Map()) } as never
  );
  const controller = new CredentialsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    definitions,
    mapper,
    new AuthorizeGoogleOAuthCredentialService(credentials as never, access as never, flow),
    new ConnectGoogleOAuthCredentialService(
      flow,
      credentials as never,
      definitions,
      access as never,
      view
    ),
    flow
  );
  return { controller, flow };
}

describe('CredentialsController Google account routes', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['getGoogleOAuthSettings', 'authorizeGoogleOAuth', 'connectGoogleOAuth'] as const)(
    '%s refuses API keys and plugins',
    handler => {
      const method = CredentialsController.prototype[handler];
      expect(Reflect.getMetadata(REJECT_API_KEY_AUTH_METADATA, method)).toBe(true);
      expect(Reflect.getMetadata(REJECT_PLUGIN_AUTH_METADATA, method)).toBe(true);
    }
  );

  it('returns no token or client secret in any response body', async () => {
    const { controller, flow } = setup();
    stubGoogleConsent();
    const { state } = await flow.generateAuthorizationUrl(
      'credential',
      'project-1',
      undefined,
      REDIRECT_URI
    );

    const settings = controller.getGoogleOAuthSettings();
    const authorization = await controller.authorizeGoogleOAuth(context, {
      redirectUri: REDIRECT_URI,
    });
    const credential = await controller.connectGoogleOAuth(context, { code: 'code-1', state });

    expect(settings).toEqual({
      available: true,
      clients: { storage: true, destination: true },
    });
    expect(authorization.authorizationUrl).toContain('storage-client-id');
    expect(credential).toMatchObject({
      identity: 'analyst@example.com',
      validationState: 'verified',
      secretConfigured: true,
    });
    const forbidden = [
      'access_token',
      'refresh_token',
      GOOGLE_TOKENS.access_token,
      GOOGLE_TOKENS.refresh_token,
      GOOGLE_TOKENS.id_token,
      GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_STORAGE_CLIENT_SECRET,
      GOOGLE_OAUTH_ENV.OAUTH_GOOGLE_DESTINATION_CLIENT_SECRET,
    ];
    for (const body of [settings, authorization, credential]) {
      const json = JSON.stringify(body);
      for (const value of forbidden) expect(json).not.toContain(value);
    }
  });
});
