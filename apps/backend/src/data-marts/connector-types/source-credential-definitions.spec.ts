import {
  BUILTIN_CREDENTIAL_DEFINITIONS,
  BUILTIN_CREDENTIAL_DEFINITION_IDS,
} from '../credentials/services/builtin-credential-definitions';
import { ConnectorService } from '../services/connector/connector.service';
import {
  buildSourceCredentialDefinitions,
  sourceBindingFor,
  sourceCredentialDefinitions,
  sourceDefinitionIdsFor,
  type ConnectorSpecSource,
} from './source-credential-definitions';

const acme: ConnectorSpecSource = {
  name: 'Acme',
  manifest: { title: 'Acme Ads', category: 'ads' },
  parameters: {
    AccountId: { label: 'Account ID', isRequired: true },
    AuthType: {
      label: 'Auth Type',
      oneOf: [
        {
          label: 'OAuth2',
          value: 'oauth2',
          attributes: ['OAUTH_FLOW'],
          items: {
            ClientId: { label: 'Client ID', isRequired: true },
            ClientSecret: { label: 'Client Secret', isRequired: true, attributes: ['SECRET'] },
            GeneratedRefreshToken: {
              label: 'Refresh token',
              attributes: ['SECRET', 'HIDE_IN_CONFIG_FORM'],
            },
          },
        },
        {
          label: 'API key',
          value: 'api_key',
          items: { ApiKey: { label: 'API key', isRequired: true, attributes: ['SECRET'] } },
        },
      ],
    },
  },
};

function generated(definitionId: string) {
  return sourceCredentialDefinitions().definitions.find(item => item.id === definitionId);
}

describe('Source credential definitions', () => {
  it('builds one definition per AuthType variant with all its items as fields', () => {
    expect(generated('source:GoogleAds:oauth2')).toMatchObject({
      connectors: ['GoogleAds'],
      auth: {
        type: 'fields',
        fields: [
          { key: 'RefreshToken', secret: true, required: true, input: 'password' },
          { key: 'ClientId', secret: false, required: true, input: 'text', identity: false },
          { key: 'ClientSecret', secret: true, required: true },
          { key: 'DeveloperToken', secret: true, required: true },
        ],
      },
    });
    expect(generated('source:GoogleAds:service_account')?.auth).toEqual({
      type: 'fields',
      fields: [
        expect.objectContaining({ key: 'ServiceAccountKey', secret: true, input: 'multiline' }),
        expect.objectContaining({ key: 'DeveloperToken', secret: true }),
      ],
    });
    expect(sourceDefinitionIdsFor('GoogleAds')).toEqual([
      'source:GoogleAds:oauth2',
      'source:GoogleAds:service_account',
    ]);
  });

  it('builds one definition for a flat connector from SECRET and CREDENTIAL parameters', () => {
    expect(generated('source:Shopify:default')?.auth).toEqual({
      type: 'fields',
      fields: [
        {
          key: 'ShopDomain',
          label: 'Shop Domain',
          input: 'text',
          secret: false,
          required: true,
          identity: true,
        },
        {
          key: 'AccessToken',
          label: 'Admin API Access Token',
          input: 'password',
          secret: true,
          required: true,
          identity: false,
        },
      ],
    });
    const reddit = generated('source:RedditAds:default');
    expect(reddit?.auth.type === 'fields' && reddit.auth.fields.map(field => field.key)).toEqual([
      'ClientId',
      'ClientSecret',
      'RedirectUri',
      'RefreshToken',
      'AccessToken',
    ]);
    expect(sourceBindingFor('Shopify', 'source:Shopify:default')).toEqual({
      definitionId: 'source:Shopify:default',
      path: [],
      connect: false,
      fieldMap: { ShopDomain: 'ShopDomain', AccessToken: 'AccessToken' },
    });
  });

  it('a variant with OAUTH_FLOW is connect: true', () => {
    expect(sourceBindingFor('GoogleAds', 'source:GoogleAds:oauth2')).toMatchObject({
      definitionId: 'source:GoogleAds:oauth2',
      path: ['AuthType', 'oauth2'],
      connect: true,
    });
    expect(sourceBindingFor('GoogleAds', 'source:GoogleAds:service_account')).toMatchObject({
      definitionId: 'source:GoogleAds:service_account',
      path: ['AuthType', 'service_account'],
      connect: false,
    });
    expect(sourceBindingFor('GoogleAds', 'source:Shopify:default')).toBeNull();
  });

  it('a variant whose connector rotates its refresh token says so: Microsoft Ads OAuth', () => {
    expect(
      sourceBindingFor('MicrosoftAds', 'source:MicrosoftAds:oauth2')?.rotatesRefreshToken
    ).toBe(true);
    expect(sourceBindingFor('GoogleAds', 'source:GoogleAds:oauth2')).not.toHaveProperty(
      'rotatesRefreshToken'
    );
  });

  it('reuses google-service-account for the Sheets service account and github for GitHub', () => {
    expect(sourceDefinitionIdsFor('GoogleSheets')).toEqual([
      'source:GoogleSheets:oauth2',
      'google-service-account',
    ]);
    expect(sourceBindingFor('GoogleSheets', 'google-service-account')).toEqual({
      definitionId: 'google-service-account',
      path: ['AuthType', 'service_account'],
      connect: false,
      fieldMap: { value: 'ServiceAccountKey' },
    });
    expect(sourceBindingFor('GitHub', 'github')).toEqual({
      definitionId: 'github',
      path: [],
      connect: false,
      fieldMap: { value: 'AccessToken' },
    });
    expect(sourceDefinitionIdsFor('GitHub')).toEqual(['github']);
    const servedConnectors = sourceCredentialDefinitions().definitions.flatMap(
      item => item.connectors ?? []
    );
    expect(servedConnectors).not.toContain('GitHub');
  });

  it('names the Sheets OAuth type Sheets Source Google account and the Google Ads service account type Google Ads service account', () => {
    expect(generated('source:GoogleSheets:oauth2')?.displayName).toBe(
      'Sheets Source Google account'
    );
    expect(generated('source:GoogleAds:service_account')?.displayName).toBe(
      'Google Ads service account'
    );
    expect(generated('source:GoogleAds:oauth2')?.displayName).toBe('Google Ads');
  });

  it('groups by manifest category', () => {
    expect(
      Object.fromEntries(
        sourceCredentialDefinitions().definitions.map(item => [item.displayName, item.category])
      )
    ).toEqual({
      'Criteo Ads': 'ads',
      'Facebook Ads': 'ads',
      'Google Ads': 'ads',
      'Google Ads service account': 'ads',
      'LinkedIn Ads': 'ads',
      'Microsoft Ads': 'ads',
      'Reddit Ads': 'ads',
      'TikTok Ads': 'ads',
      'X Ads': 'ads',
      'LinkedIn Pages': 'social',
      Shopify: 'ecommerce',
      'Open Exchange Rates': 'currencies',
      'Sheets Source Google account': 'google',
    });
  });

  it('Bank of Canada and Open Holidays get no type', () => {
    expect(sourceDefinitionIdsFor('BankOfCanada')).toEqual([]);
    expect(sourceDefinitionIdsFor('OpenHolidays')).toEqual([]);
    expect(sourceDefinitionIdsFor('constructor')).toEqual([]);
  });

  it('points every binding at a generated or built-in definition', () => {
    const { definitions, bindings } = sourceCredentialDefinitions();
    const known = new Set([
      ...definitions.map(item => item.id),
      ...BUILTIN_CREDENTIAL_DEFINITION_IDS,
    ]);
    for (const binding of Object.values(bindings).flat()) {
      expect(known).toContain(binding.definitionId);
    }
  });

  it('every binding maps each definition field to a connector parameter at its path', async () => {
    const { definitions, bindings } = sourceCredentialDefinitions();
    const connectors = new ConnectorService({} as never, {} as never);
    for (const [connectorName, list] of Object.entries(bindings)) {
      const specification = await connectors.getConnectorSpecification(connectorName);
      for (const { definitionId, path, fieldMap } of list) {
        const [, variant] = path;
        const parameters = variant
          ? Object.keys(
              specification
                .find(item => item.name === 'AuthType')
                ?.oneOf?.find(option => option.value === variant)?.items ?? {}
            )
          : specification.map(item => item.name);
        const { auth } = [...definitions, ...BUILTIN_CREDENTIAL_DEFINITIONS].find(
          item => item.id === definitionId
        )!;
        const fieldKeys = auth.type === 'fields' ? auth.fields.map(field => field.key) : ['value'];

        expect(Object.keys(fieldMap).sort()).toEqual([...fieldKeys].sort());
        for (const parameter of Object.values(fieldMap)) {
          expect(parameters).toContain(parameter);
        }
      }
    }
  });

  it('a fixture connector with a new OAuth variant gets a connect type with no backend change', () => {
    const { definitions, bindings } = buildSourceCredentialDefinitions([acme]);

    expect(definitions).toEqual([
      expect.objectContaining({
        id: 'source:Acme:oauth2',
        displayName: 'Acme Ads (OAuth2)',
        category: 'ads',
        connectors: ['Acme'],
        auth: {
          type: 'fields',
          fields: [
            expect.objectContaining({ key: 'ClientId', secret: false }),
            expect.objectContaining({ key: 'ClientSecret', secret: true }),
          ],
        },
      }),
      expect.objectContaining({ id: 'source:Acme:api_key', displayName: 'Acme Ads (API key)' }),
    ]);
    expect(bindings.Acme).toEqual([
      {
        definitionId: 'source:Acme:oauth2',
        path: ['AuthType', 'oauth2'],
        connect: true,
        fieldMap: { ClientId: 'ClientId', ClientSecret: 'ClientSecret' },
      },
      {
        definitionId: 'source:Acme:api_key',
        path: ['AuthType', 'api_key'],
        connect: false,
        fieldMap: { ApiKey: 'ApiKey' },
      },
    ]);
  });

  it('generated ids are stable', () => {
    const ids = () => buildSourceCredentialDefinitions([acme]).definitions.map(item => item.id);

    expect(ids()).toEqual(ids());
    expect(ids()).toEqual(['source:Acme:oauth2', 'source:Acme:api_key']);
  });

  // Converted Credentials keep these ids and keys: a connector rename must fail here, not orphan them.
  it('pins the generated definition ids, field keys (* secret, # identity) and bindings', () => {
    const { definitions, bindings } = sourceCredentialDefinitions();

    expect(
      definitions.map(
        d =>
          `${d.id}: ${d.auth.type === 'fields' ? d.auth.fields.map(f => f.key + (f.secret ? '*' : '') + (f.identity ? '#' : '')).join(', ') : d.auth.type}`
      )
    ).toMatchInlineSnapshot(`
      [
        "source:XAds:default: ConsumerKey*, ConsumerSecret*, AccessToken*, AccessTokenSecret*",
        "source:TikTokAds:oauth2: AccessToken*, AppId, AppSecret*",
        "source:Shopify:default: ShopDomain#, AccessToken*",
        "source:RedditAds:default: ClientId#, ClientSecret*, RedirectUri, RefreshToken*, AccessToken*",
        "source:OpenExchangeRates:default: AppId*",
        "source:MicrosoftAds:oauth2: RefreshToken*, ClientId, ClientSecret*, DeveloperToken*",
        "source:LinkedInPages:oauth2: ClientId, ClientSecret*, RefreshToken*, AccessToken*",
        "source:LinkedInAds:oauth2: ClientId, ClientSecret*, RefreshToken*, AccessToken*",
        "source:GoogleSheets:oauth2: RefreshToken*, ClientId, ClientSecret*",
        "source:GoogleAds:oauth2: RefreshToken*, ClientId, ClientSecret*, DeveloperToken*",
        "source:GoogleAds:service_account: ServiceAccountKey*, DeveloperToken*",
        "source:FacebookMarketing:oauth2: AccessToken*, AppId, AppSecret*",
        "source:CriteoAds:default: AccessToken*, ClientId#, ClientSecret*",
      ]
    `);
    expect(
      Object.entries(bindings).flatMap(([name, list]) =>
        list.map(
          b => `${name}: ${b.definitionId} at [${b.path.join('.')}] ${JSON.stringify(b.fieldMap)}`
        )
      )
    ).toMatchInlineSnapshot(`
      [
        "XAds: source:XAds:default at [] {"ConsumerKey":"ConsumerKey","ConsumerSecret":"ConsumerSecret","AccessToken":"AccessToken","AccessTokenSecret":"AccessTokenSecret"}",
        "TikTokAds: source:TikTokAds:oauth2 at [AuthType.oauth2] {"AccessToken":"AccessToken","AppId":"AppId","AppSecret":"AppSecret"}",
        "Shopify: source:Shopify:default at [] {"ShopDomain":"ShopDomain","AccessToken":"AccessToken"}",
        "RedditAds: source:RedditAds:default at [] {"ClientId":"ClientId","ClientSecret":"ClientSecret","RedirectUri":"RedirectUri","RefreshToken":"RefreshToken","AccessToken":"AccessToken"}",
        "OpenExchangeRates: source:OpenExchangeRates:default at [] {"AppId":"AppId"}",
        "MicrosoftAds: source:MicrosoftAds:oauth2 at [AuthType.oauth2] {"RefreshToken":"RefreshToken","ClientId":"ClientId","ClientSecret":"ClientSecret","DeveloperToken":"DeveloperToken"}",
        "LinkedInPages: source:LinkedInPages:oauth2 at [AuthType.oauth2] {"ClientId":"ClientId","ClientSecret":"ClientSecret","RefreshToken":"RefreshToken","AccessToken":"AccessToken"}",
        "LinkedInAds: source:LinkedInAds:oauth2 at [AuthType.oauth2] {"ClientId":"ClientId","ClientSecret":"ClientSecret","RefreshToken":"RefreshToken","AccessToken":"AccessToken"}",
        "GoogleSheets: source:GoogleSheets:oauth2 at [AuthType.oauth2] {"RefreshToken":"RefreshToken","ClientId":"ClientId","ClientSecret":"ClientSecret"}",
        "GoogleSheets: google-service-account at [AuthType.service_account] {"value":"ServiceAccountKey"}",
        "GoogleAds: source:GoogleAds:oauth2 at [AuthType.oauth2] {"RefreshToken":"RefreshToken","ClientId":"ClientId","ClientSecret":"ClientSecret","DeveloperToken":"DeveloperToken"}",
        "GoogleAds: source:GoogleAds:service_account at [AuthType.service_account] {"ServiceAccountKey":"ServiceAccountKey","DeveloperToken":"DeveloperToken"}",
        "GitHub: github at [] {"value":"AccessToken"}",
        "FacebookMarketing: source:FacebookMarketing:oauth2 at [AuthType.oauth2] {"AccessToken":"AccessToken","AppId":"AppId","AppSecret":"AppSecret"}",
        "CriteoAds: source:CriteoAds:default at [] {"AccessToken":"AccessToken","ClientId":"ClientId","ClientSecret":"ClientSecret"}",
      ]
    `);
  });
});
