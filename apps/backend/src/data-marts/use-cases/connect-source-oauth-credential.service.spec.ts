jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CREDENTIAL_VALIDATION_ENTITIES } from '../../../test/fixtures/credential-validation-writes';
import { Credential } from '../credentials/entities/credential.entity';
import { CredentialService } from '../credentials/services/credential.service';
import type { AuthorizationContext } from '../../idp';
import { sourceCredentialDefinitions } from '../connector-types/source-credential-definitions';
import { Connectors } from '@owox/connectors';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { ConnectorService } from '../services/connector/connector.service';
import { ConnectSourceOAuthCredentialService } from './connect-source-oauth-credential.service';

const context = {
  projectId: 'project-1',
  userId: 'member-1',
  roles: ['editor'],
} as AuthorizationContext;

const GOOGLE_ADS_ENV = {
  OAUTH_GOOGLE_ADS_CLIENT_ID: 'client-id-value',
  OAUTH_GOOGLE_ADS_CLIENT_SECRET: 'client-secret-value',
  OAUTH_GOOGLE_ADS_REDIRECT_URI: 'https://app.example.com/oauth',
  OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN: 'developer-token-value',
};
const LINKEDIN_ADS_ENV = {
  OAUTH_LINKEDIN_ADS_CLIENT_ID: 'client-id-value',
  OAUTH_LINKEDIN_ADS_CLIENT_SECRET: 'client-secret-value',
  OAUTH_LINKEDIN_ADS_REDIRECT_URI: 'https://app.example.com/oauth',
};
const FACEBOOK_ENV = {
  OAUTH_FACEBOOK_MARKETING_APP_ID: 'app-id-value',
  OAUTH_FACEBOOK_MARKETING_APP_SECRET: 'app-secret-value',
};
const TOKENS = ['refresh-value', 'access-value', 'client-secret-value', 'developer-token-value'];

const googleAdsSignIn = (userId = '42') => ({
  credentials: {
    refresh_token: 'refresh-value',
    access_token: 'access-value',
    client_id: 'client-id-value',
    client_secret: 'client-secret-value',
    developer_token: 'developer-token-value',
  },
  user: { id: userId, name: `${userId}@example.com` },
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  warnings: undefined,
});

function existingCredential() {
  return {
    id: 'credential-1',
    definitionId: 'source:GoogleAds:oauth2',
    secret: { fields: { RefreshToken: 'old', ClientSecret: 'old', DeveloperToken: 'old' } },
    publicMetadata: {
      fields: { ClientId: 'old' },
      connection: { account: { id: '42', name: '42@example.com', email: null }, expiresAt: null },
    },
  };
}

function setup({ canEdit = true, existing = existingCredential() as object } = {}) {
  const connectors = new ConnectorService({} as never, {} as never);
  const exchangeOauth = jest.spyOn(connectors, 'exchangeOauth');
  const credentials = {
    createWithAccess: jest.fn((value: object) =>
      Promise.resolve({ id: 'credential-new', ...value })
    ),
    replaceSignIn: jest.fn().mockResolvedValue(undefined),
    lockActiveByIdAndProjectId: jest.fn().mockResolvedValue(existing),
    getByIdAndProjectId: jest.fn().mockResolvedValue(existing),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(canEdit) };
  const service = new ConnectSourceOAuthCredentialService(
    connectors,
    credentials as never,
    new CredentialDefinitionService({} as never, {} as never),
    access as never
  );
  return { service, exchangeOauth, credentials, access };
}

describe('ConnectSourceOAuthCredentialService', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      ...GOOGLE_ADS_ENV,
      ...LINKEDIN_ADS_ENV,
      ...FACEBOOK_ENV,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("exchange creates a Credential of the variant's generated type, Not shared, owned by the caller, titled with the account name when known", async () => {
    const { service, exchangeOauth, credentials } = setup();
    exchangeOauth.mockResolvedValue(googleAdsSignIn());

    const result = await service.run(context, 'GoogleAds', {
      fieldPath: 'AuthType.oauth2',
      payload: { code: 'code-value' },
    });

    expect(exchangeOauth).toHaveBeenCalledWith('GoogleAds', 'AuthType.oauth2', {
      code: 'code-value',
    });
    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        title: '42@example.com',
        definitionSource: 'builtin',
        definitionId: 'source:GoogleAds:oauth2',
        secret: {
          fields: {
            RefreshToken: 'refresh-value',
            ClientSecret: 'client-secret-value',
            DeveloperToken: 'developer-token-value',
          },
        },
        publicMetadata: {
          fields: { ClientId: 'client-id-value' },
          connection: {
            account: { id: '42', name: '42@example.com', email: null },
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        },
        enabled: true,
        availableForUse: false,
        availableForMaintenance: false,
      }),
      { createdBy: context, ownerIds: [], contextIds: [] }
    );
    expect(result).toEqual({
      success: true,
      credentialId: 'credential-new',
      user: { id: '42', name: '42@example.com' },
      reasons: undefined,
    });
    for (const token of TOKENS) expect(JSON.stringify(result)).not.toContain(token);
  });

  it("the exchange response carries no token even when the connector's additional data holds one", async () => {
    const { service, credentials } = setup();
    // The Graph API echoes the token in paging links of the ad accounts the connector adds.
    jest
      .spyOn(
        Connectors.FacebookMarketing.FacebookMarketingSource.prototype,
        'exchangeOauthCredentials'
      )
      .mockResolvedValue({
        user: { id: '7', name: 'Ann' },
        secret: { accessToken: 'access-value' },
        expiresIn: 3600,
        additional: {
          adAccounts: {
            data: [{ id: 'act_1', name: 'Ads' }],
            paging: { next: 'https://graph.facebook.com/me/adaccounts?access_token=access-value' },
          },
        },
        warnings: [],
      });

    const result = await service.run(context, 'FacebookMarketing', {
      fieldPath: 'AuthType.oauth2',
      payload: { accessToken: 'short-lived-value' },
    });

    expect(JSON.stringify(result)).not.toContain('access-value');
    const [stored] = credentials.createWithAccess.mock.calls[0] as [Record<string, unknown>];
    expect(stored.secret).toEqual({ fields: { AccessToken: 'access-value' } });
    expect(JSON.stringify(stored.publicMetadata)).not.toContain('access-value');
  });

  it('takes title, owners, Contexts and sharing from the credential block', async () => {
    const { service, exchangeOauth, credentials } = setup();
    exchangeOauth.mockResolvedValue(googleAdsSignIn());

    await service.run(context, 'GoogleAds', {
      fieldPath: 'AuthType.oauth2',
      payload: { code: 'code-value' },
      credential: {
        title: ' Ads team ',
        ownerIds: ['member-2'],
        contextIds: ['context-1'],
        availableForUse: true,
        availableForMaintenance: true,
      },
    });

    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ads team',
        availableForUse: true,
        availableForMaintenance: true,
      }),
      { createdBy: context, ownerIds: ['member-2'], contextIds: ['context-1'] }
    );
  });

  it('names a Credential after its type when the connector names no account', async () => {
    const { service, exchangeOauth, credentials } = setup();
    exchangeOauth.mockResolvedValue({
      credentials: {
        refresh_token: 'refresh-value',
        access_token: 'access-value',
        client_id: 'client-id-value',
        client_secret: 'client-secret-value',
      },
      user: { id: 'unknown', name: 'LinkedIn Ads User' },
      expiresAt: null,
    });

    await service.run(context, 'LinkedInAds', {
      fieldPath: 'AuthType.oauth2',
      payload: { code: 'code-value' },
    });

    const type = sourceCredentialDefinitions().definitions.find(
      definition => definition.id === 'source:LinkedInAds:oauth2'
    );
    expect(credentials.createWithAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        title: type?.displayName,
        publicMetadata: expect.objectContaining({
          connection: { account: null, expiresAt: null },
        }),
      }),
      expect.anything()
    );
  });

  describe('exchange with credential.id', () => {
    it('reconnects it in place', async () => {
      const { service, exchangeOauth, credentials, access } = setup();
      exchangeOauth.mockResolvedValue(googleAdsSignIn('42'));

      const result = await service.run(context, 'GoogleAds', {
        fieldPath: 'AuthType.oauth2',
        payload: { code: 'code-value' },
        credential: { id: 'credential-1' },
      });

      expect(access.canAccess).toHaveBeenCalledWith(
        'member-1',
        ['editor'],
        'CREDENTIAL',
        'credential-1',
        'EDIT',
        'project-1'
      );
      expect(credentials.createWithAccess).not.toHaveBeenCalled();
      expect(credentials.replaceSignIn).toHaveBeenCalledWith(
        'credential-1',
        expect.objectContaining({
          secret: {
            fields: {
              RefreshToken: 'refresh-value',
              ClientSecret: 'client-secret-value',
              DeveloperToken: 'developer-token-value',
            },
          },
          validationState: 'verified',
        })
      );
      expect(result.credentialId).toBe('credential-1');
    });

    it('refuses another account', async () => {
      const { service, exchangeOauth, credentials } = setup();
      exchangeOauth.mockResolvedValue(googleAdsSignIn('99'));

      const refused = service.run(context, 'GoogleAds', {
        fieldPath: 'AuthType.oauth2',
        payload: { code: 'code-value' },
        credential: { id: 'credential-1' },
      });

      await expect(refused).rejects.toThrow(
        new BadRequestException(
          'Sign in to the same account (42@example.com), or create a new Credential.'
        )
      );
      expect(credentials.replaceSignIn).not.toHaveBeenCalled();
    });

    it('refuses a member without EDIT before signing in', async () => {
      const { service, exchangeOauth } = setup({ canEdit: false });

      await expect(
        service.run(context, 'GoogleAds', {
          fieldPath: 'AuthType.oauth2',
          payload: { code: 'code-value' },
          credential: { id: 'credential-1' },
        })
      ).rejects.toThrow(ForbiddenException);
      expect(exchangeOauth).not.toHaveBeenCalled();
    });

    it('refuses a Credential of another definition', async () => {
      const { service, exchangeOauth } = setup({
        existing: { ...existingCredential(), definitionId: 'source:GoogleAds:service_account' },
      });

      await expect(
        service.run(context, 'GoogleAds', {
          fieldPath: 'AuthType.oauth2',
          payload: { code: 'code-value' },
          credential: { id: 'credential-1' },
        })
      ).rejects.toThrow(BadRequestException);
      expect(exchangeOauth).not.toHaveBeenCalled();
    });
  });

  it('exchange refuses a fieldPath without OAUTH_FLOW', async () => {
    const { service, exchangeOauth } = setup();

    await expect(
      service.run(context, 'GoogleAds', {
        fieldPath: 'AuthType.service_account',
        payload: { code: 'code-value' },
      })
    ).rejects.toThrow(BadRequestException);
    expect(exchangeOauth).not.toHaveBeenCalled();
  });

  it('exchange refuses a connector whose OAuth env is not configured', async () => {
    const { service, exchangeOauth } = setup();
    delete process.env.OAUTH_GOOGLE_ADS_DEVELOPER_TOKEN;

    await expect(
      service.run(context, 'GoogleAds', {
        fieldPath: 'AuthType.oauth2',
        payload: { code: 'code-value' },
      })
    ).rejects.toThrow(BadRequestException);
    expect(exchangeOauth).not.toHaveBeenCalled();
  });

  it("answers an OAuth flow failure with 400 and the connector's message", async () => {
    const { service, exchangeOauth } = setup();
    exchangeOauth.mockRejectedValue(
      Object.assign(new Error('Token exchange failed: invalid_grant'), {
        name: 'OauthFlowException',
      })
    );

    await expect(
      service.run(context, 'GoogleAds', {
        fieldPath: 'AuthType.oauth2',
        payload: { code: 'code-value' },
      })
    ).rejects.toThrow(new BadRequestException('Token exchange failed: invalid_grant'));
  });
});

describe('ConnectSourceOAuthCredentialService reconnect on real persistence', () => {
  let dataSource: DataSource;
  let repository: Repository<Credential>;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: CREDENTIAL_VALIDATION_ENTITIES,
      synchronize: true,
      logging: false,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository(Credential);
  });
  afterAll(() => dataSource.destroy());
  beforeEach(() => {
    jest.replaceProperty(process, 'env', { ...process.env, ...GOOGLE_ADS_ENV });
  });
  afterEach(() => jest.restoreAllMocks());

  async function given(accountId = '42') {
    const { id } = await repository.save(
      repository.create({
        projectId: 'project-1',
        title: 'Ads',
        definitionSource: 'builtin',
        definitionId: 'source:GoogleAds:oauth2',
        secret: { fields: { RefreshToken: 'old', ClientSecret: 'old', DeveloperToken: 'old' } },
        publicMetadata: {
          fields: { ClientId: 'old' },
          connection: {
            account: { id: accountId, name: '42@example.com', email: null },
            expiresAt: null,
          },
        },
        enabled: true,
        availableForUse: true,
        availableForMaintenance: true,
        refreshTokenStaticAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    );
    return id;
  }

  /**
   * Runs a reconnect. `inExchange` runs while the exchange is in flight; `afterRead` runs right
   * after reconnect's own read of the Credential, i.e. between its read and its write.
   */
  async function reconnect(
    id: string,
    {
      inExchange,
      afterRead,
      userId = '42',
    }: {
      inExchange?: () => Promise<unknown>;
      afterRead?: () => Promise<unknown>;
      userId?: string;
    } = {}
  ) {
    const connectors = new ConnectorService({} as never, {} as never);
    let armed = false;
    jest.spyOn(connectors, 'exchangeOauth').mockImplementation(async () => {
      await inExchange?.();
      armed = true;
      return googleAdsSignIn(userId);
    });
    const findOne = repository.findOne.bind(repository);
    jest.spyOn(repository, 'findOne').mockImplementation(async options => {
      const row = await findOne(options);
      if (armed && afterRead) {
        armed = false;
        await afterRead();
      }
      return row;
    });
    const credentials = new CredentialService(
      repository,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    const service = new ConnectSourceOAuthCredentialService(
      connectors,
      credentials,
      new CredentialDefinitionService({} as never, {} as never),
      { canAccess: jest.fn().mockResolvedValue(true) } as never
    );
    return service.run(context, 'GoogleAds', {
      fieldPath: 'AuthType.oauth2',
      payload: { code: 'code-value' },
      credential: { id },
    });
  }

  it('keeps a disable made during the exchange and stores the new sign-in', async () => {
    const id = await given();

    await reconnect(id, { afterRead: () => repository.update({ id }, { enabled: false }) });

    const stored = await repository.findOneByOrFail({ id });
    expect(stored.enabled).toBe(false);
    expect(stored.secret).toEqual({
      fields: {
        RefreshToken: 'refresh-value',
        ClientSecret: 'client-secret-value',
        DeveloperToken: 'developer-token-value',
      },
    });
    expect(stored.publicMetadata).toMatchObject({
      connection: { account: { id: '42' }, expiresAt: '2030-01-01T00:00:00.000Z' },
    });
    expect(stored.validationState).toBe('verified');
  });

  it('keeps sharing turned off during the exchange', async () => {
    const id = await given();

    await reconnect(id, {
      afterRead: () =>
        repository.update({ id }, { availableForUse: false, availableForMaintenance: false }),
    });

    const stored = await repository.findOneByOrFail({ id });
    expect(stored.availableForUse).toBe(false);
    expect(stored.availableForMaintenance).toBe(false);
  });

  it('answers not found for a Credential deleted during the exchange and writes nothing', async () => {
    const id = await given();

    await expect(
      reconnect(id, { inExchange: () => repository.update({ id }, { deletedAt: new Date() }) })
    ).rejects.toThrow(new NotFoundException(`Credential ${id} was not found`));

    const stored = await repository.findOneOrFail({ where: { id }, withDeleted: true });
    expect(stored.secret).toEqual({
      fields: { RefreshToken: 'old', ClientSecret: 'old', DeveloperToken: 'old' },
    });
    expect(stored.enabled).toBe(true);
    expect(stored.refreshTokenStaticAt).not.toBeNull();
  });

  it('refuses another account and writes nothing', async () => {
    const id = await given();

    await expect(reconnect(id, { userId: '99' })).rejects.toThrow(
      new BadRequestException(
        'Sign in to the same account (42@example.com), or create a new Credential.'
      )
    );

    const stored = await repository.findOneByOrFail({ id });
    expect(stored.secret).toEqual({
      fields: { RefreshToken: 'old', ClientSecret: 'old', DeveloperToken: 'old' },
    });
    expect(stored.enabled).toBe(true);
    expect(stored.refreshTokenStaticAt).not.toBeNull();
  });

  it('clears the static-token marker', async () => {
    const id = await given();

    await reconnect(id);

    expect((await repository.findOneByOrFail({ id })).refreshTokenStaticAt).toBeNull();
  });
});
