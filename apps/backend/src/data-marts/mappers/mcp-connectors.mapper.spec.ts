import { McpConnectorsMapper } from './mcp-connectors.mapper';

describe('McpConnectorsMapper', () => {
  const mapper = new McpConnectorsMapper();

  it('drops secret values in nested auth branches and OAuth configuration internals', () => {
    const result = mapper.toSpecification([
      {
        name: 'AuthType',
        title: 'Authentication',
        oneOf: [
          {
            label: 'OAuth',
            value: 'oauth2',
            attributes: ['OAUTH_FLOW'],
            oauthParams: { vars: { secret: 'hidden-oauth-value' } },
            items: {
              ClientSecret: {
                name: 'ClientSecret',
                attributes: ['SECRET'],
                default: 'hidden-default',
                placeholder: 'hidden-placeholder',
                options: ['hidden-option'],
              },
            },
          },
        ],
      },
      {
        name: 'SheetId',
        title: 'Sheet',
        attributes: ['DYNAMIC_OPTIONS'],
        optionsDependsOn: ['SpreadsheetId', 'AuthType'],
        required: true,
      },
    ]);

    expect(result[0].oneOf?.[0]).toEqual({
      label: 'OAuth',
      value: 'oauth2',
      attributes: ['OAUTH_FLOW'],
      items: {
        ClientSecret: expect.objectContaining({ name: 'ClientSecret', attributes: ['SECRET'] }),
      },
    });
    expect(JSON.stringify(result)).not.toContain('hidden-');
    expect(result[1]).toMatchObject({
      name: 'SheetId',
      attributes: ['DYNAMIC_OPTIONS'],
      optionsDependsOn: ['SpreadsheetId', 'AuthType'],
      required: true,
    });
  });

  it('removes internal bookkeeping recursively from public reusable settings', () => {
    expect(
      mapper.toPublicConfiguration({
        _id: 'internal-id',
        _secrets_id: 'credential-id',
        AuthType: { oauth2: { _source_credential_id: 'oauth-id', Token: '**********' } },
        tables: [{ table: 'revenue', _internal: 'internal' }],
      })
    ).toEqual({
      AuthType: { oauth2: { Token: '**********' } },
      tables: [{ table: 'revenue' }],
    });
  });

  it('withholds defaults inside a parameter whose whole value is secret', () => {
    const result = mapper.toSpecification([
      {
        name: 'Credentials',
        attributes: ['SECRET'],
        oneOf: [
          {
            label: 'API key',
            value: 'api_key',
            items: { Value: { name: 'Value', default: 'hidden-parent-secret' } },
          },
        ],
      },
    ]);

    expect(JSON.stringify(result)).not.toContain('hidden-parent-secret');
  });

  it('omits manifest payloads and unknown provider fields from node projections', () => {
    expect(
      mapper.toNodes([
        {
          name: 'rows',
          fields: [{ name: 'id', type: 'string', token: 'hidden' }],
          manifest: { token: 'hidden' },
        },
      ] as never)
    ).toEqual([{ name: 'rows', fields: [{ name: 'id', type: 'string' }] }]);
  });
});
