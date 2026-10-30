import { serviceAccountKey } from '../../../../test/fixtures/google-service-account-key';
import {
  planSourceCredentialConversion,
  type OldSourceKeyRow,
  type SourceConversionOptions,
  type UnconvertedSourceConfig,
} from './source-credential-conversion-plan';

const EXPIRES_AT = new Date('2026-12-01T00:00:00.000Z');

/** A refresh-token manifest whose `ClientId` is a non-secret key parameter. */
const MANIFEST = {
  version: '1.0',
  name: 'AcmeApi',
  baseUrl: 'https://API.acme.example/v1',
  authentication: {
    type: 'oauth2',
    grantType: 'refresh_token',
    tokenUrl: 'https://auth.acme.example/token',
    clientId: '{{ parameters.ClientId }}',
    clientSecret: '{{ parameters.ClientSecret }}',
    refreshToken: '{{ parameters.RefreshToken }}',
  },
  parameters: {
    ClientId: { requiredType: 'string', isRequired: true, label: 'Client ID' },
    ClientSecret: { requiredType: 'string', isRequired: true },
    RefreshToken: { requiredType: 'string', isRequired: true },
    Account: { requiredType: 'string' },
  },
  nodes: {
    items: {
      destinationName: 'items',
      isTimeSeries: false,
      uniqueKeys: ['id'],
      fields: { id: { type: 'string' } },
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: ['data'] },
    },
  },
};

let next = 0;

function source(
  connectorName: string,
  config: Record<string, unknown>,
  overrides: Partial<UnconvertedSourceConfig> = {}
): UnconvertedSourceConfig {
  next += 1;
  return {
    dataMartId: `data-mart-${next}`,
    projectId: 'project-1',
    dataMartTitle: 'Sales',
    createdAt: new Date(Date.UTC(2026, 0, next)),
    technicalOwnerIds: ['tech-1'],
    businessOwnerIds: ['business-1'],
    contextIds: [],
    connectorName,
    config: { _id: `config-${next}`, ...config },
    ...overrides,
  };
}

function row(
  connectorName: string,
  credentials: unknown,
  overrides: Partial<OldSourceKeyRow> = {}
): OldSourceKeyRow {
  return {
    projectId: 'project-1',
    connectorName,
    userId: null,
    credentials,
    user: null,
    expiresAt: null,
    ...overrides,
  };
}

function plan(
  sources: UnconvertedSourceConfig[],
  rows: Record<string, OldSourceKeyRow> = {},
  options: Partial<SourceConversionOptions> = {}
) {
  return planSourceCredentialConversion(sources, {
    oldRows: new Map(Object.entries(rows)),
    credentials: new Map(),
    ...options,
  });
}

const configOf = ({ dataMartId, config }: UnconvertedSourceConfig) => ({
  dataMartId,
  configId: config._id,
});

describe('planSourceCredentialConversion', () => {
  it('a _secrets_id row becomes a Credential of the connector variant definition', () => {
    const typed = source('GoogleAds', {
      _secrets_id: 'row-1',
      AuthType: { oauth2: { ClientId: 'client-1' } },
      CustomerId: '123',
    });

    const { credentials, skipped } = plan([typed], {
      'row-1': row(
        'GoogleAds',
        JSON.stringify({
          'AuthType.oauth2.RefreshToken': 'refresh-1',
          'AuthType.oauth2.ClientSecret': 'client-secret-1',
          'AuthType.oauth2.DeveloperToken': 'developer-1',
          generated_refresh_token: 'rotated-1',
        })
      ),
    });

    expect(skipped).toEqual([]);
    expect(credentials).toEqual([
      {
        projectId: 'project-1',
        definitionId: 'source:GoogleAds:oauth2',
        title: 'Google Ads — Sales',
        secret: {
          fields: {
            RefreshToken: 'refresh-1',
            ClientSecret: 'client-secret-1',
            DeveloperToken: 'developer-1',
            generated_refresh_token: 'rotated-1',
            legacy_generated_refresh_token: 'rotated-1',
          },
        },
        // Inline key values convert too.
        publicMetadata: { fields: { ClientId: 'client-1' } },
        ownerIds: ['tech-1'],
        contextIds: [],
        bindings: [configOf(typed)],
      },
    ]);
  });

  it('a reused definition holds the key as its one value', () => {
    const key = serviceAccountKey();
    const github = source('GitHub', { _secrets_id: 'row-1', RepositoryName: 'owox/owox' });
    const sheets = source('GoogleSheets', {
      _secrets_id: 'row-2',
      AuthType: { service_account: {} },
    });

    const { credentials } = plan([github, sheets], {
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
      'row-2': row('GoogleSheets', { 'AuthType.service_account.ServiceAccountKey': key }),
    });

    expect(
      credentials.map(({ definitionId, secret, publicMetadata }) => ({
        definitionId,
        secret,
        publicMetadata,
      }))
    ).toEqual([
      { definitionId: 'github', secret: { value: 'ghp-1' }, publicMetadata: null },
      {
        definitionId: 'google-service-account',
        secret: { value: key },
        publicMetadata: {
          clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
          projectId: 'acme-docs',
          privateKeyId: 'key-1',
          clientId: '1234567890',
        },
      },
    ]);
  });

  it('deprecated top-level fields are read into the variant fields', () => {
    const old = source('LinkedInAds', { _secrets_id: 'row-1', ClientID: 'client-1' });
    const both = source('LinkedInAds', {
      _secrets_id: 'row-2',
      ClientID: 'deprecated-client',
      AuthType: { oauth2: { ClientId: 'variant-client' } },
    });

    const { credentials } = plan([old, both], {
      'row-1': row('LinkedInAds', { ClientSecret: 'secret-1', RefreshToken: 'refresh-1' }),
      'row-2': row('LinkedInAds', {
        ClientSecret: 'secret-2',
        'AuthType.oauth2.RefreshToken': 'refresh-2',
      }),
    });

    expect(
      credentials.map(({ definitionId, secret, publicMetadata }) => ({
        definitionId,
        secret,
        publicMetadata,
      }))
    ).toEqual([
      {
        definitionId: 'source:LinkedInAds:oauth2',
        secret: { fields: { ClientSecret: 'secret-1', RefreshToken: 'refresh-1' } },
        publicMetadata: { fields: { ClientId: 'client-1' } },
      },
      {
        definitionId: 'source:LinkedInAds:oauth2',
        // As the connector reads them: the variant value first.
        secret: { fields: { ClientSecret: 'secret-2', RefreshToken: 'refresh-2' } },
        publicMetadata: { fields: { ClientId: 'variant-client' } },
      },
    ]);
  });

  it('reads a deprecated parameter with the OAuth variant selected only where the connector does', () => {
    const tikTokOAuth = source('TikTokAds', {
      AuthType: { oauth2: { _source_credential_id: 'tiktok-1' } },
      AppId: 'legacy-app',
      AppSecret: 'legacy-app-secret',
    });
    const tikTokTyped = source('TikTokAds', { _secrets_id: 'row-1', AppId: 'legacy-app' });

    const { credentials } = plan([tikTokOAuth, tikTokTyped], {
      'tiktok-1': row('TikTokAds', { accessToken: 'access-1' }),
      'row-1': row('TikTokAds', { AccessToken: 'access-2', AppSecret: 'app-secret-2' }),
    });

    expect(credentials.map(({ secret, publicMetadata }) => ({ secret, publicMetadata }))).toEqual([
      // With oauth2 selected, TikTok reads AppId and AppSecret from the variant, then the env.
      {
        secret: { fields: { AccessToken: 'access-1' } },
        publicMetadata: { fields: {}, connection: { account: null, expiresAt: null } },
      },
      {
        secret: { fields: { AccessToken: 'access-2', AppSecret: 'app-secret-2' } },
        publicMetadata: { fields: { AppId: 'legacy-app' } },
      },
    ]);
  });

  it('keeps one Microsoft Ads OAuth row whole whatever legacy developer tokens its configurations hold', () => {
    const configuration = (rowId: string, DeveloperToken: string) =>
      source('MicrosoftAds', {
        AuthType: { oauth2: { _source_credential_id: rowId } },
        DeveloperToken,
      });
    const grant = { refresh_token: 'refresh-1', client_id: 'client-1', client_secret: 'secret-1' };
    const first = configuration('with-token', 'legacy-a');
    const second = configuration('with-token', 'legacy-b');
    const envFirst = configuration('without-token', 'legacy-a');
    const envSecond = configuration('without-token', 'legacy-b');

    const { credentials, skipped } = plan([first, second, envFirst, envSecond], {
      'with-token': row('MicrosoftAds', { ...grant, developer_token: 'developer-1' }),
      'without-token': row('MicrosoftAds', grant),
    });

    expect(credentials).toHaveLength(1);
    expect(credentials[0].bindings).toEqual([configOf(first), configOf(second)]);
    expect(credentials[0].secret).toEqual({
      fields: {
        RefreshToken: 'refresh-1',
        ClientSecret: 'secret-1',
        DeveloperToken: 'developer-1',
      },
    });
    // The run takes the developer token from the env there, which a Credential cannot hold.
    expect(skipped).toEqual([
      { ...configOf(envFirst), reason: 'no value for Developer Token' },
      { ...configOf(envSecond), reason: 'no value for Developer Token' },
    ]);
  });

  it('a custom connector row becomes a custom-connector Credential with hosts and field list of the version the Data Mart runs', () => {
    const custom = source(
      'AcmeApi',
      { _secrets_id: 'row-1', ClientId: 'client-1', Account: 'acct-1' },
      { custom: { title: 'Acme API', manifest: MANIFEST } }
    );

    const { credentials, skipped } = plan([custom], {
      'row-1': row('AcmeApi', {
        ClientSecret: 'secret-1',
        RefreshToken: 'refresh-1',
        generated_refresh_token: 'rotated-1',
      }),
    });

    expect(skipped).toEqual([]);
    expect(credentials).toEqual([
      {
        projectId: 'project-1',
        definitionId: 'custom-connector',
        title: 'Acme API — Sales',
        secret: {
          fields: {
            ClientSecret: 'secret-1',
            RefreshToken: 'refresh-1',
            generated_refresh_token: 'rotated-1',
            legacy_generated_refresh_token: 'rotated-1',
          },
        },
        publicMetadata: {
          hosts: ['api.acme.example', 'auth.acme.example'],
          fieldList: [
            { key: 'ClientId', label: 'Client ID', secret: false },
            { key: 'ClientSecret', label: 'ClientSecret', secret: true },
            { key: 'RefreshToken', label: 'RefreshToken', secret: true },
          ],
          fields: { ClientId: 'client-1' },
        },
        ownerIds: ['tech-1'],
        contextIds: [],
        bindings: [configOf(custom)],
      },
    ]);
  });

  it('a manifest that misuses a key parameter is skipped with its position', () => {
    const manifest = structuredClone(MANIFEST) as typeof MANIFEST & {
      nodes: { items: { transformations?: unknown[] } };
    };
    manifest.nodes.items.transformations = [
      { type: 'add', field: 'client', value: '{{ parameters.ClientId }}' },
    ];
    const misusing = source(
      'AcmeApi',
      { _secrets_id: 'row-1', ClientId: 'client-1' },
      { custom: { title: 'Acme API', manifest } }
    );

    const { credentials, skipped } = plan([misusing], {
      'row-1': row('AcmeApi', { ClientSecret: 'secret-1', RefreshToken: 'refresh-1' }),
    });

    expect(credentials).toEqual([]);
    expect(skipped).toEqual([
      {
        ...configOf(misusing),
        reason: 'the manifest uses a key parameter in transformations.add of node items',
      },
    ]);
  });

  describe('a project-level OAuth row', () => {
    const oauthRow = (overrides: Partial<OldSourceKeyRow> = {}) =>
      row(
        'LinkedInAds',
        {
          refresh_token: 'refresh-1',
          access_token: 'access-1',
          client_id: 'client-1',
          client_secret: 'secret-1',
          generated_refresh_token: 'rotated-1',
        },
        {
          userId: 'member-1',
          user: JSON.stringify({ id: 'unknown', name: 'LinkedIn Ads User' }),
          expiresAt: EXPIRES_AT,
          ...overrides,
        }
      );
    const connected = (overrides: Partial<UnconvertedSourceConfig> = {}) =>
      source(
        'LinkedInAds',
        { AuthType: { oauth2: { _source_credential_id: 'oauth-1' } } },
        overrides
      );

    it('becomes one Credential, never split, owned by the member who connected it', () => {
      const first = connected({ technicalOwnerIds: ['tech-1'], contextIds: ['c1', 'c2'] });
      const second = connected({
        dataMartTitle: 'Leads',
        technicalOwnerIds: ['tech-2'],
        contextIds: ['c2', 'c3'],
      });

      const { credentials } = plan([first, second], { 'oauth-1': oauthRow() });

      expect(credentials).toEqual([
        {
          projectId: 'project-1',
          definitionId: 'source:LinkedInAds:oauth2',
          title: 'LinkedIn Ads — Sales',
          secret: {
            fields: {
              ClientSecret: 'secret-1',
              RefreshToken: 'refresh-1',
              AccessToken: 'access-1',
              generated_refresh_token: 'rotated-1',
              legacy_generated_refresh_token: 'rotated-1',
            },
          },
          publicMetadata: {
            fields: { ClientId: 'client-1' },
            // LinkedIn names no account.
            connection: { account: null, expiresAt: EXPIRES_AT.toISOString() },
          },
          ownerIds: ['member-1'],
          contextIds: ['c2'],
          bindings: [configOf(first), configOf(second)],
        },
      ]);
    });

    it("records as the base the token of the row a run reads, the OAuth row's beside a _secrets_id", () => {
      const both = source('LinkedInAds', {
        _secrets_id: 'row-1',
        AuthType: { oauth2: { _source_credential_id: 'oauth-1' } },
      });

      const { credentials } = plan([both], {
        'oauth-1': oauthRow(),
        'row-1': row('LinkedInAds', { generated_refresh_token: 'rotated-by-secrets-row' }),
      });

      expect(credentials.map(({ secret }) => secret)).toEqual([
        {
          fields: expect.objectContaining({
            generated_refresh_token: 'rotated-by-secrets-row',
            legacy_generated_refresh_token: 'rotated-1',
          }),
        },
      ]);
    });

    it("without userId is owned by its Data Marts' technical owners, else business owners", () => {
      const first = connected({ technicalOwnerIds: ['tech-1'] });
      const second = connected({ technicalOwnerIds: [], businessOwnerIds: ['business-2'] });

      const { credentials } = plan([first, second], { 'oauth-1': oauthRow({ userId: null }) });

      expect(credentials).toHaveLength(1);
      expect(credentials[0].ownerIds).toEqual(['business-2', 'tech-1']);
    });

    it('a _source_credential_id that names a Credential of the connector is bound to it', () => {
      const bound = connected();
      const alsoBound = connected();

      const { credentials, bindings, skipped } = plan(
        [bound, alsoBound],
        {},
        {
          credentials: new Map([
            ['oauth-1', { projectId: 'project-1', definitionId: 'source:LinkedInAds:oauth2' }],
          ]),
        }
      );

      expect(credentials).toEqual([]);
      expect(bindings).toEqual([
        { ...configOf(bound), projectId: 'project-1', credentialId: 'oauth-1' },
        { ...configOf(alsoBound), projectId: 'project-1', credentialId: 'oauth-1' },
      ]);
      expect(skipped).toEqual([]);

      const foreign = plan(
        [connected()],
        {},
        {
          credentials: new Map([
            ['oauth-1', { projectId: 'project-1', definitionId: 'source:GoogleAds:oauth2' }],
          ]),
        }
      );
      expect(foreign.bindings).toEqual([]);
      expect(foreign.skipped).toEqual([
        expect.objectContaining({ reason: 'its old key names a Credential of another connector' }),
      ]);
    });
  });

  it('owners are technical owners, business owners only when there are none', () => {
    const technical = source(
      'GitHub',
      { _secrets_id: 'row-1' },
      { technicalOwnerIds: ['tech-2', 'tech-1', 'tech-2'], businessOwnerIds: ['business-1'] }
    );
    const business = source(
      'GitHub',
      { _secrets_id: 'row-2' },
      { technicalOwnerIds: [], businessOwnerIds: ['business-1'] }
    );

    const { credentials } = plan([technical, business], {
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
      'row-2': row('GitHub', { AccessToken: 'ghp-2' }),
    });

    expect(credentials.map(credential => credential.ownerIds)).toEqual([
      ['tech-1', 'tech-2'],
      ['business-1'],
    ]);
  });

  it('identical values with the same owners merge; different owners do not', () => {
    const first = source('GitHub', { _secrets_id: 'row-1' }, { contextIds: ['c1', 'c2'] });
    const same = source('GitHub', { _secrets_id: 'row-2' }, { contextIds: ['c2'] });
    const otherOwners = source(
      'GitHub',
      { _secrets_id: 'row-3' },
      { technicalOwnerIds: ['tech-2'] }
    );
    const token = row('GitHub', { AccessToken: 'ghp-1' });

    const { credentials } = plan([first, same, otherOwners], {
      'row-1': token,
      'row-2': token,
      'row-3': token,
    });

    expect(credentials.map(({ bindings, contextIds }) => ({ bindings, contextIds }))).toEqual([
      { bindings: [configOf(first), configOf(same)], contextIds: ['c2'] },
      { bindings: [configOf(otherOwners)], contextIds: [] },
    ]);
  });

  it('title is the account name or "<Connector> — <Data Mart title>", cut to 255', () => {
    const named = source('GoogleAds', {
      AuthType: { oauth2: { _source_credential_id: 'oauth-1' } },
    });
    const long = source('GitHub', { _secrets_id: 'row-1' }, { dataMartTitle: 'x'.repeat(300) });

    const { credentials } = plan([named, long], {
      'oauth-1': row(
        'GoogleAds',
        {
          refresh_token: 'refresh-1',
          client_id: 'client-1',
          client_secret: 'secret-1',
          developer_token: 'developer-1',
        },
        { user: { id: 'g-1', name: 'Ann Lee', email: 'ann@example.com' } }
      ),
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
    });

    expect(credentials.map(credential => credential.title)).toEqual([
      'Ann Lee',
      `GitHub — ${'x'.repeat(300)}`.slice(0, 255),
    ]);
    expect(credentials[0].publicMetadata).toEqual({
      fields: { ClientId: 'client-1' },
      connection: {
        account: { id: 'g-1', name: 'Ann Lee', email: 'ann@example.com' },
        expiresAt: null,
      },
    });
  });

  it('an OAuth row whose account name or email is not text keeps no account', () => {
    const users = [
      { id: 'g-1', name: 42, email: 'ann@example.com' },
      { id: 'g-2', name: 'Ann Lee', email: { address: 'ann@example.com' } },
    ];
    const sources = users.map((_, index) =>
      source('GoogleAds', { AuthType: { oauth2: { _source_credential_id: `oauth-${index}` } } })
    );

    const { credentials } = plan(
      sources,
      Object.fromEntries(
        users.map((user, index) => [
          `oauth-${index}`,
          row(
            'GoogleAds',
            {
              refresh_token: `refresh-${index}`,
              client_id: 'client-1',
              client_secret: 'secret-1',
              developer_token: 'developer-1',
            },
            { user: JSON.stringify(user) }
          ),
        ])
      )
    );

    expect(credentials.map(({ title, publicMetadata }) => ({ title, publicMetadata }))).toEqual(
      users.map(() => ({
        title: 'Google Ads — Sales',
        publicMetadata: {
          fields: { ClientId: 'client-1' },
          connection: { account: null, expiresAt: null },
        },
      }))
    );
  });

  it('warns once per configuration whose OAuth row names an unreadable account, and never for no account', () => {
    const oauth = (n: number) =>
      source('GoogleAds', { AuthType: { oauth2: { _source_credential_id: `oauth-${n}` } } });
    const [unreadable, none, unknown] = [oauth(0), oauth(1), oauth(2)];
    const key = {
      refresh_token: 'refresh-1',
      client_id: 'client-1',
      client_secret: 'secret-1',
      developer_token: 'developer-1',
    };

    const { warnings } = plan([unreadable, none, unknown], {
      'oauth-0': row('GoogleAds', key, { user: JSON.stringify({ id: 'g-1', name: 42 }) }),
      'oauth-1': row('GoogleAds', { ...key, refresh_token: 'refresh-2' }),
      'oauth-2': row(
        'GoogleAds',
        { ...key, refresh_token: 'refresh-3' },
        {
          user: JSON.stringify({ id: 'unknown' }),
        }
      ),
    });

    expect(warnings).toEqual([
      { ...configOf(unreadable), reason: expect.stringContaining('account') },
    ]);
    expect(JSON.stringify(warnings)).not.toContain('refresh-');
  });

  it('unknown connector, unresolvable version and unparseable rows are skipped with a reason', () => {
    const unknown = source('Gone', { _secrets_id: 'row-1' });
    const unpublished = source('AcmeApi', { _secrets_id: 'row-1' }, { custom: null });
    const unparseable = source('GitHub', { _secrets_id: 'row-2' });
    const missing = source('GitHub', { _secrets_id: 'row-3' });
    const foreign = source('GitHub', { _secrets_id: 'row-4' });
    const incomplete = source('LinkedInAds', { _secrets_id: 'row-5' });

    const { credentials, skipped } = plan(
      [unknown, unpublished, unparseable, missing, foreign, incomplete],
      {
        'row-1': row('AcmeApi', { Token: 'leaked-1' }),
        'row-2': row('GitHub', '{not json leaked-2'),
        'row-4': row('GitHub', { AccessToken: 'leaked-4' }, { projectId: 'project-2' }),
        'row-5': row('LinkedInAds', { 'AuthType.oauth2.RefreshToken': 'leaked-5' }),
      }
    );

    expect(credentials).toEqual([]);
    expect(skipped).toEqual([
      { ...configOf(unknown), reason: 'unknown connector' },
      { ...configOf(unpublished), reason: 'its custom connector has no published version to run' },
      { ...configOf(unparseable), reason: 'unparseable old key row' },
      { ...configOf(missing), reason: 'its old key row is missing' },
      { ...configOf(foreign), reason: 'its old key belongs to another project' },
      { ...configOf(incomplete), reason: 'no value for Client ID' },
    ]);
    expect(JSON.stringify(skipped)).not.toContain('leaked');
  });

  it('a configuration without an id of its own keeps its old key', () => {
    const noId = source('GitHub', { _secrets_id: 'row-1' });
    delete (noId.config as Record<string, unknown>)._id;

    const { credentials, skipped } = plan([noId], {
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
    });

    expect(credentials).toEqual([]);
    expect(skipped).toEqual([
      { dataMartId: noId.dataMartId, configId: null, reason: 'the configuration has no id' },
    ]);
  });

  it('two configurations sharing an _id both keep their old keys and no binding names that id', () => {
    const first = source('GitHub', { _secrets_id: 'row-1' });
    const sameId = { ...first, config: { ...first.config, _secrets_id: 'row-2' } };
    // Runs resolve a binding by _id, so a keyless twin would run on the other's Credential.
    const keyed = source('GitHub', { _secrets_id: 'row-1' });
    const keyless = { ...keyed, config: { _id: keyed.config._id, RepositoryName: 'owox/owox' } };
    const named = source('LinkedInAds', {
      AuthType: { oauth2: { _source_credential_id: 'credential-1' } },
    });
    const otherDataMart = source('GitHub', { _id: first.config._id, _secrets_id: 'row-1' });

    const { credentials, bindings, skipped } = plan(
      [first, sameId, keyed, keyless, named, { ...named }, otherDataMart],
      {
        'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
        'row-2': row('GitHub', { AccessToken: 'ghp-2' }),
      },
      {
        credentials: new Map([
          ['credential-1', { projectId: 'project-1', definitionId: 'source:LinkedInAds:oauth2' }],
        ]),
      }
    );

    expect(credentials.map(credential => credential.bindings)).toEqual([[configOf(otherDataMart)]]);
    expect(bindings).toEqual([]);
    const shared = 'configurations of the Data Mart share this id';
    expect(skipped).toEqual([
      { ...configOf(first), reason: shared },
      { ...configOf(sameId), reason: shared },
      { ...configOf(keyed), reason: shared },
      { ...configOf(named), reason: shared },
      { ...configOf(named), reason: shared },
    ]);
  });

  it('ids that differ only in case, accents or width share one binding key, as MySQL compares them', () => {
    const lower = source('GitHub', { _id: 'main', _secrets_id: 'row-1' });
    const upper = { ...lower, config: { _id: 'Main', _secrets_id: 'row-1' } };
    const accented = { ...lower, config: { _id: 'mÁin', _secrets_id: 'row-1' } };
    const fullWidth = {
      ...lower,
      config: { _id: '\uFF4D\uFF41\uFF49\uFF4E', _secrets_id: 'row-1' },
    };

    const { credentials, skipped } = plan([lower, upper, accented, fullWidth], {
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
    });

    expect(credentials).toEqual([]);
    const shared = 'configurations of the Data Mart share this id';
    expect(skipped).toEqual([
      { ...configOf(lower), reason: shared },
      { ...configOf(upper), reason: shared },
      { ...configOf(accented), reason: shared },
      { ...configOf(fullWidth), reason: shared },
    ]);
  });

  it('a configuration whose id exceeds 255 characters keeps its old key', () => {
    const long = source('GitHub', { _id: 'x'.repeat(256), _secrets_id: 'row-1' });
    // The column counts characters, not UTF-16 units.
    const fits = source('GitHub', { _id: '𝔁'.repeat(255), _secrets_id: 'row-1' });

    const { credentials, skipped } = plan([long, fits], {
      'row-1': row('GitHub', { AccessToken: 'ghp-1' }),
    });

    expect(credentials.map(credential => credential.bindings)).toEqual([[configOf(fits)]]);
    expect(skipped).toEqual([
      { ...configOf(long), reason: 'its id is longer than 255 characters' },
    ]);
  });

  it('leaves a configuration with no key alone', () => {
    const { credentials, skipped } = plan([
      source('GitHub', { RepositoryName: 'owox/owox' }),
      source('BankOfCanada', { Currencies: 'USD' }),
    ]);

    expect(credentials).toEqual([]);
    expect(skipped).toEqual([]);
  });
});
