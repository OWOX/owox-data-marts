import { BadRequestException } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { McpConnectorConfigurationService } from './mcp-connector-configuration.service';

describe('McpConnectorConfigurationService', () => {
  const specification = [
    { name: 'SpreadsheetId', requiredType: 'string' },
    { name: 'Limit', requiredType: 'number' },
    { name: 'Extra', requiredType: 'object' },
    { name: 'Columns', requiredType: 'array' },
    { name: 'Password', attributes: ['SECRET'] },
    {
      name: 'AuthType',
      oneOf: [
        {
          label: 'OAuth',
          value: 'oauth2',
          items: {
            ClientId: { name: 'ClientId', requiredType: 'string' },
            Label: { name: 'Label', requiredType: 'string' },
            Token: { name: 'Token', attributes: ['SECRET'] },
          },
        },
      ],
    },
  ];
  let service: McpConnectorConfigurationService;
  let connectors: { resolveConnectorSpecification: jest.Mock; resolveSourceKeys: jest.Mock };

  beforeEach(() => {
    connectors = {
      resolveConnectorSpecification: jest.fn().mockResolvedValue(specification),
      resolveSourceKeys: jest.fn().mockResolvedValue({
        fields: [{ path: ['AuthType', 'oauth2'], parameters: ['ClientId'] }],
        model: null,
      }),
    };
    service = new McpConnectorConfigurationService(connectors as unknown as ConnectorService);
  });

  it('accepts incomplete non-secret fields and root Credential references', async () => {
    await expect(
      service.assertNonSecretConfiguration(
        'project',
        'Sheets',
        {
          _id: 'config',
          _credential_id: 'credential',
          SpreadsheetId: 'sheet',
          Limit: 10,
          AuthType: { oauth2: { Label: 'read only' } },
          Extra: { labels: ['a'] },
          Columns: ['id'],
        },
        2
      )
    ).resolves.toBeUndefined();
    expect(connectors.resolveConnectorSpecification).toHaveBeenCalledWith('project', 'Sheets', 2);
    expect(connectors.resolveSourceKeys).toHaveBeenCalledWith('project', 'Sheets', 2);
  });

  it.each([
    { Password: 'raw-secret' },
    { AuthType: { oauth2: { Token: 'raw-secret' } } },
    { AuthType: { oauth2: { ClientId: 'credential-owned-public-field' } } },
    { Unknown: 'value' },
    { AuthType: { oauth2: { Unknown: true } } },
    { _source_credential_id: 'legacy' },
    { Extra: { _secrets_id: 'legacy' } },
    { Columns: [{ _credential_id: 'nested' }] },
    { SpreadsheetId: 42 },
  ])('rejects secrets, unknown fields and nested credential references: %p', async config => {
    await expect(service.assertNonSecretConfiguration('project', 'Sheets', config)).rejects.toThrow(
      BadRequestException
    );
    try {
      await service.assertNonSecretConfiguration('project', 'Sheets', config);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('raw-secret');
    }
  });

  it('also excludes top-level custom connector key parameters', async () => {
    connectors.resolveSourceKeys.mockResolvedValue({
      fields: [{ path: [], parameters: ['SpreadsheetId'] }],
      model: {},
    });
    await expect(
      service.assertNonSecretConfiguration('project', 'Custom', { SpreadsheetId: 'key' }, 3)
    ).rejects.toThrow(BadRequestException);
  });

  it('removes credentials at declared paths and preserves public JSON with the same field names', async () => {
    const publicConfigs = await service.toPublicConfigurations('project', 'Sheets', [
      {
        _id: 'config',
        _credential_id: 'credential',
        SpreadsheetId: 'sheet',
        Password: 'raw-secret',
        Unknown: 'internal',
        _secrets_id: 'old',
        AuthType: { oauth2: { Label: 'public', ClientId: 'key', Token: 'secret', unknown: true } },
        Extra: { labels: ['a'], nested: [{ ClientId: 'public-column', public: true }] },
        Columns: [{ ClientId: 'public-column' }],
      },
    ]);
    expect(publicConfigs).toEqual([
      {
        _id: 'config',
        _credential_id: 'credential',
        SpreadsheetId: 'sheet',
        AuthType: { oauth2: { Label: 'public' } },
        Extra: { labels: ['a'], nested: [{ ClientId: 'public-column', public: true }] },
        Columns: [{ ClientId: 'public-column' }],
      },
    ]);
    if (publicConfigs === null) throw new Error('Expected readable public configurations');
    await expect(
      service.assertNonSecretConfiguration('project', 'Sheets', publicConfigs[0])
    ).resolves.toBeUndefined();
  });

  it('returns no configuration if the stored schema cannot be resolved safely', async () => {
    connectors.resolveConnectorSpecification.mockRejectedValue(new Error('manifest secret'));
    await expect(
      service.toPublicConfigurations('project', 'Missing', [
        {
          _id: 'config',
          _credential_id: 'credential',
          Password: 'secret',
        },
      ])
    ).resolves.toBeNull();
  });

  it('accepts public object and array values whose keys match Credential fields', async () => {
    await expect(
      service.assertNonSecretConfiguration('project', 'Sheets', {
        Extra: { ClientId: 'public-column', nested: [{ ClientId: 'another-column' }] },
        Columns: [{ ClientId: 'public-column' }],
      })
    ).resolves.toBeUndefined();
  });

  it('preserves public underscore keys in object values and arrays', async () => {
    const configuration = {
      _id: 'configuration-id',
      _credential_id: 'credential-id',
      Extra: { value: { _id: 'public-record-id', _eq: 'public-filter' } },
      Columns: [{ _id: 'public-column-id' }],
    };
    await expect(
      service.toPublicConfigurations('project', 'Sheets', [configuration])
    ).resolves.toEqual([configuration]);
    await expect(
      service.assertNonSecretConfiguration('project', 'Sheets', configuration)
    ).resolves.toBeUndefined();
  });

  it.each(['_secrets_id', '_source_credential_id', '_credential_id'])(
    'omits the entire replacement when public JSON contains the reserved reference %s',
    async key => {
      const configuration = { Extra: { [key]: 'internal-reference' } };
      await expect(
        service.toPublicConfigurations('project', 'Sheets', [configuration])
      ).resolves.toBeNull();
      await expect(
        service.assertNonSecretConfiguration('project', 'Sheets', configuration)
      ).rejects.toThrow(BadRequestException);
    }
  );

  it('preserves a public field whose name is Credential-owned in another auth variant', async () => {
    connectors.resolveConnectorSpecification.mockResolvedValue([
      ...specification,
      { name: 'ClientId', requiredType: 'string' },
      {
        name: 'Mode',
        oneOf: [
          { value: 'public', items: { ClientId: { name: 'ClientId', requiredType: 'string' } } },
        ],
      },
    ]);
    const configuration = { ClientId: 'column', Mode: { public: { ClientId: 'column' } } };
    await expect(
      service.toPublicConfigurations('project', 'Custom', [configuration])
    ).resolves.toEqual([configuration]);
    await expect(
      service.assertNonSecretConfiguration('project', 'Custom', configuration)
    ).resolves.toBeUndefined();
  });

  it.each([null, '', {}])('rejects clearing a Credential-owned field with %p', async value => {
    await expect(
      service.assertNonSecretConfiguration('project', 'Sheets', {
        AuthType: { oauth2: { ClientId: value } },
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('preserves accepted stored Google Sheets numeric strings and their neighboring settings', async () => {
    const realService = new McpConnectorConfigurationService(
      new ConnectorService({} as never, {} as never)
    );
    const stored = {
      _id: 'config',
      _credential_id: 'credential',
      SpreadsheetId: 'sheet',
      HeaderRow: '2',
      InferTypes: true,
    };
    await expect(
      realService.toPublicConfigurations('project', 'GoogleSheets', [stored])
    ).resolves.toEqual([stored]);
    await expect(
      realService.assertNonSecretConfiguration('project', 'GoogleSheets', stored)
    ).resolves.toBeUndefined();
  });

  it.each(['NaN', 'Infinity', '', ' ', 'two', null, true])(
    'rejects invalid numeric settings without exposing their value: %p',
    async Limit => {
      await expect(
        service.assertNonSecretConfiguration('project', 'Sheets', { Limit })
      ).rejects.toThrow(BadRequestException);
    }
  );

  it('preserves declared public JSON values in nested variants without preserving secrets', async () => {
    connectors.resolveConnectorSpecification.mockResolvedValue([
      ...specification,
      {
        name: 'Mode',
        oneOf: [
          {
            value: 'custom',
            items: {
              Count: { name: 'Count', requiredType: 'number' },
              Secret: { name: 'Secret', attributes: ['SECRET'] },
            },
          },
        ],
      },
    ]);
    await expect(
      service.toPublicConfigurations('project', 'Custom', [
        {
          SpreadsheetId: 'sheet',
          Mode: { custom: { Count: '2', Secret: 'private-7136', unknown: 'hidden' } },
          Unknown: 'hidden',
        },
      ])
    ).resolves.toEqual([{ SpreadsheetId: 'sheet', Mode: { custom: { Count: '2' } } }]);
  });

  it('does not return parser payloads when custom specification resolution fails', async () => {
    connectors.resolveConnectorSpecification.mockRejectedValue(new Error('stored-secret'));
    await expect(service.assertNonSecretConfiguration('project', 'Custom', {})).rejects.toThrow(
      BadRequestException
    );
  });

  it('keeps the selected SECRET auth variant without exposing its values', async () => {
    connectors.resolveConnectorSpecification.mockResolvedValue([
      {
        name: 'AuthType',
        oneOf: [
          {
            value: 'apiKey',
            attributes: ['SECRET'],
            items: { Account: { name: 'Account', requiredType: 'string' } },
          },
        ],
      },
    ]);
    const publicConfigs = await service.toPublicConfigurations('project', 'Custom', [
      {
        _id: 'config',
        AuthType: { apiKey: { Account: 'hidden-account', _secrets_id: 'legacy' } },
      },
    ]);

    expect(publicConfigs).toEqual([{ _id: 'config', AuthType: { apiKey: {} } }]);
    await expect(
      service.assertNonSecretConfiguration('project', 'Custom', {
        _id: 'config',
        AuthType: { apiKey: {} },
      })
    ).resolves.toBeUndefined();
    await expect(
      service.assertNonSecretConfiguration('project', 'Custom', {
        AuthType: { apiKey: { Account: 'hidden-account' } },
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts real bundled Google Sheets settings and rejects its Credential fields', async () => {
    const realService = new McpConnectorConfigurationService(
      new ConnectorService({} as never, {} as never)
    );
    await expect(
      realService.assertNonSecretConfiguration('project', 'GoogleSheets', {
        _id: 'config',
        _credential_id: 'credential',
        SpreadsheetId: 'sheet',
        SheetName: 'Sheet1',
      })
    ).resolves.toBeUndefined();
    await expect(
      realService.assertNonSecretConfiguration('project', 'GoogleSheets', {
        AuthType: { service_account: { ServiceAccountKey: 'private-key' } },
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('omits the entire list when a later configuration cannot be read safely', async () => {
    await expect(
      service.toPublicConfigurations('project', 'Sheets', [
        { _id: 'readable', SpreadsheetId: 'sheet' },
        { _id: 42, Password: 'private-token' },
      ])
    ).resolves.toBeNull();
  });

  it('keeps an empty configuration list without resolving connector metadata', async () => {
    await expect(service.toPublicConfigurations('project', 'Missing', [])).resolves.toEqual([]);
    expect(connectors.resolveConnectorSpecification).not.toHaveBeenCalled();
    expect(connectors.resolveSourceKeys).not.toHaveBeenCalled();
  });
});
