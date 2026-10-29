import { redactMcpTelemetry } from './mcp-telemetry-redaction';

describe('redactMcpTelemetry for custom connectors', () => {
  it('masks flagged parameter values while preserving definitions and ordinary settings', () => {
    const input = {
      manifest: {
        parameters: {
          Value: {
            attributes: ['SECRET'],
            label: 'Access value',
            default: 'private-default',
            placeholder: 'private-placeholder',
            options: ['private-option'],
          },
          TokenCount: { label: 'Number of tokens', default: 100 },
          Region: { default: 'eu' },
        },
        nodes: { items: { request: { path: '/items' } } },
      },
      node: 'items',
      configuration: { Value: 'private-value', Region: 'eu' },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      ...input,
      manifest: {
        ...input.manifest,
        parameters: {
          ...input.manifest.parameters,
          Value: {
            attributes: ['SECRET'],
            label: 'Access value',
            default: '[REDACTED]',
            placeholder: '[REDACTED]',
            options: '[REDACTED]',
          },
        },
      },
      configuration: { Value: '[REDACTED]', Region: 'eu' },
    });
    expect(input).toEqual(original);
  });

  it('masks raw credential parameters in incomplete drafts without hiding ordinary values', () => {
    const input = {
      manifest: {
        parameters: {
          Authorization: 'private-authorization',
          ApiKey: ['private-key'],
          TokenCount: 100,
          Region: 'eu',
        },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Authorization: '[REDACTED]',
          ApiKey: '[REDACTED]',
          TokenCount: 100,
          Region: 'eu',
        },
      },
    });
    expect(input).toEqual(original);
  });

  it.each(['Authorization', 'ApiKey', 'api_key', 'API-KEY', 'AccessToken', 'client_secret'])(
    'masks unflagged %s parameter values while preserving schema metadata',
    name => {
      const definition = {
        label: 'Service credential',
        description: 'Enter the credential for your account',
        requiredType: 'string',
        attributes: ['REQUIRED'],
        default: 'private-default',
        placeholder: 'private-placeholder',
        options: ['private-option'],
      };
      const ordinaryParameters = {
        TokenCount: { requiredType: 'number', default: 100 },
        TokenUrl: { default: 'https://example.com/oauth/token' },
        TokenPath: { default: 'access_token' },
        PageToken: { default: 'next-page' },
        SecretName: { default: 'service-credential' },
        PasswordHint: { default: 'Use your service account' },
        ClientId: { default: 'public-client' },
      };
      const input = {
        manifest: { parameters: { [name]: definition, ...ordinaryParameters } },
        configuration: { [name]: 'private-runtime', Region: 'eu' },
      };
      const original = structuredClone(input);

      expect(redactMcpTelemetry(input)).toEqual({
        manifest: {
          parameters: {
            [name]: {
              ...definition,
              default: '[REDACTED]',
              placeholder: '[REDACTED]',
              options: '[REDACTED]',
            },
            ...ordinaryParameters,
          },
        },
        configuration: { [name]: '[REDACTED]', Region: 'eu' },
      });
      expect(input).toEqual(original);
    }
  );

  it.each(['DeveloperToken', 'AppSecret', 'ApiSecret', 'SecretKey', 'PersonalAccessToken'])(
    'masks compound credential parameter %s while preserving public configuration',
    name => {
      const input = {
        manifest: {
          parameters: {
            [name]: {
              label: 'Service credential',
              default: 'private-default',
              placeholder: 'private-placeholder',
              options: ['private-option'],
            },
            TokenCount: { default: 100 },
            PageToken: { default: 'next-page' },
          },
        },
        configuration: { [name]: 'private-runtime', TokenCount: 100, PageToken: 'next-page' },
      };
      expect(redactMcpTelemetry(input)).toEqual({
        manifest: {
          parameters: {
            [name]: {
              label: 'Service credential',
              default: '[REDACTED]',
              placeholder: '[REDACTED]',
              options: '[REDACTED]',
            },
            TokenCount: { default: 100 },
            PageToken: { default: 'next-page' },
          },
        },
        configuration: { [name]: '[REDACTED]', TokenCount: 100, PageToken: 'next-page' },
      });
    }
  );

  it.each(
    [
      'Bearer private-value',
      [{ type: 'bearer', inject: { format: 'Bearer private-value' } }],
      { type: 'bearer', inject: 'Bearer private-value' },
      { type: 'bearer', inject: [{ format: 'Bearer private-value' }] },
      { type: 'tokenExchange', exchange: 'private-value' },
      { type: 'selective', authenticators: ['private-value'] },
    ].map(authentication => ({ authentication }))
  )('masks literal credentials in malformed authentication: %j', ({ authentication }) => {
    const input = {
      manifest: {
        authentication,
        name: 'Readable connector',
        nodes: { items: { request: { path: '/items' } } },
      },
    };
    const before = structuredClone(input);
    const result = redactMcpTelemetry(input);
    expect(JSON.stringify(result)).not.toContain('private-value');
    expect(result).toMatchObject({
      manifest: { name: 'Readable connector', nodes: input.manifest.nodes },
    });
    expect(input).toEqual(before);
  });

  it.each(
    [
      [{ name: 'Value', attributes: ['SECRET'], default: 'private-value' }],
      {
        Mode: { oneOf: { items: { Value: { attributes: ['SECRET'], default: 'private-value' } } } },
      },
      { Mode: { oneOf: [[{ name: 'Value', attributes: ['SECRET'], default: 'private-value' }]] } },
      {
        Mode: {
          oneOf: [
            {
              value: 'api',
              items: [{ name: 'Value', attributes: ['SECRET'], default: 'private-value' }],
            },
          ],
        },
      },
    ].map(parameters => ({ parameters }))
  )('masks secrets in malformed parameter containers: %j', ({ parameters }) => {
    const input = { manifest: { name: 'Readable connector', parameters } };
    const before = structuredClone(input);
    const result = redactMcpTelemetry(input);
    expect(JSON.stringify(result)).not.toContain('private-value');
    expect(result).toMatchObject({ manifest: { name: 'Readable connector' } });
    expect(input).toEqual(before);
  });

  it('masks flagged OAuth variable values while keeping OAuth metadata and public variables', () => {
    const input = {
      manifest: {
        parameters: {
          Auth: {
            oneOf: [
              {
                value: 'oauth',
                label: 'OAuth',
                oauthParams: {
                  vars: {
                    Value: {
                      attributes: ['SECRET'],
                      label: 'Credential',
                      key: 'SERVICE_CREDENTIAL',
                      default: 'private-default',
                      value: 'private-value',
                    },
                    ClientId: { default: 'public-client' },
                    RedirectUri: { default: 'https://example.com/callback' },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const before = structuredClone(input);
    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Auth: {
            oneOf: [
              {
                value: 'oauth',
                label: 'OAuth',
                oauthParams: {
                  vars: {
                    Value: {
                      attributes: ['SECRET'],
                      label: 'Credential',
                      key: 'SERVICE_CREDENTIAL',
                      default: '[REDACTED]',
                      value: '[REDACTED]',
                    },
                    ClientId: { default: 'public-client' },
                    RedirectUri: { default: 'https://example.com/callback' },
                  },
                },
              },
            ],
          },
        },
      },
    });
    expect(input).toEqual(before);
  });

  it('masks request credentials and URL values while preserving paths, public query values and references', () => {
    const input = {
      manifest: {
        baseUrl: 'https://api.example.com/v1?key=private-key&region=eu',
        nodes: {
          items: {
            request: {
              path: '/items?appid=private-app&page=2',
              headers: {
                'X-Auth-Key': 'private-auth',
                'Ocp-Apim-Subscription-Key': 'private-subscription',
                Accept: 'application/json',
              },
              queryParameters: {
                key: 'private-query',
                access_key: 'private-access',
                appid: '{{ parameters.AppId }}',
                page: 2,
              },
            },
            fields: { key: { type: 'string' }, TokenCount: { type: 'integer' } },
          },
        },
      },
    };
    const before = structuredClone(input);
    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        baseUrl: 'https://api.example.com/v1?key=[REDACTED]&region=eu',
        nodes: {
          items: {
            request: {
              path: '/items?appid=[REDACTED]&page=2',
              headers: {
                'X-Auth-Key': '[REDACTED]',
                'Ocp-Apim-Subscription-Key': '[REDACTED]',
                Accept: 'application/json',
              },
              queryParameters: {
                key: '[REDACTED]',
                access_key: '[REDACTED]',
                appid: '{{ parameters.AppId }}',
                page: 2,
              },
            },
            fields: { key: { type: 'string' }, TokenCount: { type: 'integer' } },
          },
        },
      },
    });
    expect(input).toEqual(before);
  });

  it.each([
    { password: 'private-password', userinfo: 'alice:private-password' },
    { password: 'private/p:ssword', userinfo: 'alice:private%2Fp%3Assword' },
  ])('masks a URL password and its echoed value: $userinfo', ({ password, userinfo }) => {
    const input = { manifest: { baseUrl: `https://${userinfo}@example.com/api?region=eu` } };
    const result = {
      error: `Authentication failed for ${password}`,
      logs: [`Encoded value: ${encodeURIComponent(password)}`],
      region: 'eu',
    };
    const before = structuredClone({ input, result });

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: { baseUrl: 'https://[REDACTED]@example.com/api?region=eu' },
    });
    expect(redactMcpTelemetry(result, input)).toEqual({
      error: 'Authentication failed for [REDACTED]',
      logs: ['Encoded value: [REDACTED]'],
      region: 'eu',
    });
    expect({ input, result }).toEqual(before);
  });

  it('preserves public URLs whose query or fragment contains an at sign', () => {
    const input = {
      manifest: {
        baseUrl: 'https://example.com?email=alice@example.com&region=eu',
        docsUrl: 'https://example.com#contact=alice@example.com',
      },
    };
    expect(redactMcpTelemetry(input)).toEqual(input);
  });

  it.each(['foo\ud800bar', 'foo\udc00bar'])(
    'masks a secret with an unpaired Unicode surrogate and its escaped copies: %j',
    secret => {
      const input = { manifest: { authentication: { type: 'bearer', token: secret } } };
      const result = {
        error: `Rejected ${secret}`,
        logs: [`Upstream echoed ${JSON.stringify(secret)}`],
        rows: [{ value: secret, count: 7 }],
      };
      const before = structuredClone({ input, result });
      expect(redactMcpTelemetry(input)).toEqual({
        manifest: { authentication: { type: 'bearer', token: '[REDACTED]' } },
      });
      expect(redactMcpTelemetry(result, input)).toEqual({
        error: 'Rejected [REDACTED]',
        logs: ['Upstream echoed "[REDACTED]"'],
        rows: [{ value: '[REDACTED]', count: 7 }],
      });
      expect({ input, result }).toEqual(before);
    }
  );

  it('masks known request secrets echoed in arbitrary result strings without changing public data', () => {
    const secret = 'private/"escaped secret"';
    const input = {
      manifest: {
        parameters: { Value: { attributes: ['SECRET'], default: 'private-default' } },
        authentication: { type: 'bearer', inject: { format: 'Bearer private-auth' } },
        baseUrl: 'https://example.com?key=private-query&region=eu',
      },
      configuration: { Value: secret, Region: 'eu' },
    };
    const result = {
      rows: [{ note: secret, region: 'eu' }],
      logs: [
        `GET /items/${encodeURIComponent(secret)}`,
        `upstream echoed ${JSON.stringify(secret)}`,
        'rejected private-auth and private-query',
      ],
      sample: [{ note: 'private-default' }],
      error: `Rejected ${secret}`,
    };
    const original = structuredClone({ input, result });
    expect(redactMcpTelemetry(result, input)).toEqual({
      rows: [{ note: '[REDACTED]', region: 'eu' }],
      logs: [
        'GET /items/[REDACTED]',
        'upstream echoed "[REDACTED]"',
        'rejected [REDACTED] and [REDACTED]',
      ],
      sample: [{ note: '[REDACTED]' }],
      error: 'Rejected [REDACTED]',
    });
    expect({ input, result }).toEqual(original);
  });

  it('masks raw parameters referenced by authentication even with an ordinary name', () => {
    const authentication = { type: 'bearer', token: '{{ parameters.Value }}' };

    expect(
      redactMcpTelemetry({
        manifest: { authentication, parameters: { Value: 'private-value', Region: 'eu' } },
      })
    ).toEqual({
      manifest: { authentication, parameters: { Value: '[REDACTED]', Region: 'eu' } },
    });
  });

  it('masks credential keys inside parameter defaults while preserving ordinary values', () => {
    const input = {
      manifest: {
        parameters: {
          Settings: {
            label: 'Request settings',
            requiredType: 'object',
            default: {
              Authorization: 'private-header',
              Region: 'eu',
              endpoints: [{ path: '/items', api_key: 'private-key' }],
            },
          },
          TokenCount: { default: 100 },
        },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Settings: {
            label: 'Request settings',
            requiredType: 'object',
            default: {
              Authorization: '[REDACTED]',
              Region: 'eu',
              endpoints: [{ path: '/items', api_key: '[REDACTED]' }],
            },
          },
          TokenCount: { default: 100 },
        },
      },
    });
    expect(input).toEqual(original);
  });

  it.each([true, false])('masks oneOf credentials with nested items present: %s', withItems => {
    const input = {
      manifest: {
        parameters: {
          Auth: {
            label: 'Authentication method',
            oneOf: [
              {
                label: 'OAuth',
                value: 'oauth',
                oauthParams: { clientId: 'public-client', clientSecret: 'private-client-secret' },
                ...(withItems
                  ? {
                      items: {
                        AccessToken: { attributes: ['SECRET'], default: 'private-token' },
                        Region: { default: 'eu' },
                      },
                    }
                  : {}),
              },
            ],
          },
        },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Auth: {
            label: 'Authentication method',
            oneOf: [
              {
                label: 'OAuth',
                value: 'oauth',
                oauthParams: { clientId: 'public-client', clientSecret: '[REDACTED]' },
                ...(withItems
                  ? {
                      items: {
                        AccessToken: { attributes: ['SECRET'], default: '[REDACTED]' },
                        Region: { default: 'eu' },
                      },
                    }
                  : {}),
              },
            ],
          },
        },
      },
    });
    expect(input).toEqual(original);
  });

  it('masks authentication secrets in incomplete drafts without hiding selectors or usernames', () => {
    const authentication = {
      type: 'selective',
      selectionParameter: 'Mode',
      authenticators: {
        api: {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Pat }}',
          },
        },
        basic: {
          type: 'basic',
          username: '{{ parameters.User }}',
          password: '{{ parameters.Pass }}',
        },
        usernameKey: { type: 'basic', username: '{{ parameters.Key }}' },
      },
    };
    const input = {
      manifest: {
        authentication,
        parameters: {
          Pat: {
            default: 'private-default',
            placeholder: 'private-placeholder',
            options: ['private-option'],
          },
          Pass: { default: 'private-pass' },
          Key: { default: 'private-key' },
          Mode: { default: 'api' },
          User: { default: 'public-user' },
        },
      },
      configuration: {
        Pat: 'private-pat',
        Pass: 'private-pass',
        Key: 'private-key',
        Mode: 'api',
        User: 'public-user',
      },
    };
    const original = structuredClone(input);
    const result = redactMcpTelemetry(input);

    expect(result).toMatchObject({
      manifest: {
        authentication: {
          selectionParameter: 'Mode',
          authenticators: { api: authentication.authenticators.api },
        },
        parameters: {
          Pat: { default: '[REDACTED]', placeholder: '[REDACTED]', options: '[REDACTED]' },
          Pass: { default: '[REDACTED]' },
          Key: { default: '[REDACTED]' },
          Mode: { default: 'api' },
          User: { default: 'public-user' },
        },
      },
      configuration: {
        Pat: '[REDACTED]',
        Pass: '[REDACTED]',
        Key: '[REDACTED]',
        Mode: 'api',
        User: 'public-user',
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(input).toEqual(original);
  });

  it.each([
    {
      name: 'literal bearer credential',
      authentication: {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer private-value' },
      },
      expected: {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: '[REDACTED]' },
      },
    },
    {
      name: 'Basic API key without a password',
      authentication: { type: 'basic', username: 'private-value' },
      expected: { type: 'basic', username: '[REDACTED]' },
    },
    {
      name: 'Basic API key with an empty password',
      authentication: { type: 'basic', username: 'private-value', password: '' },
      expected: { type: 'basic', username: '[REDACTED]', password: '' },
    },
    {
      name: 'Basic password with a public username',
      authentication: { type: 'basic', username: 'public-user', password: 'private-value' },
      expected: { type: 'basic', username: 'public-user', password: '[REDACTED]' },
    },
    {
      name: 'OAuth credentials with public connection settings',
      authentication: {
        type: 'oauth2',
        tokenUrl: 'https://example.com/oauth/token',
        clientId: 'public-client',
        clientSecret: 'private-client-secret',
        refreshToken: 'private-refresh-token',
        grantType: 'refresh_token',
        scope: 'read:items',
        ttlSeconds: 300,
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      expected: {
        type: 'oauth2',
        tokenUrl: 'https://example.com/oauth/token',
        clientId: 'public-client',
        clientSecret: '[REDACTED]',
        refreshToken: '[REDACTED]',
        grantType: 'refresh_token',
        scope: 'read:items',
        ttlSeconds: 300,
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
    },
    {
      name: 'token exchange credentials with request and response metadata',
      authentication: {
        type: 'tokenExchange',
        exchange: {
          url: 'https://example.com/token',
          method: 'POST',
          tokenPath: ['data', 'access_token'],
          ttlSeconds: 300,
          body: { login: '{{ parameters.Login }}', values: ['private-value'] },
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
      expected: {
        type: 'tokenExchange',
        exchange: {
          url: 'https://example.com/token',
          method: 'POST',
          tokenPath: ['data', 'access_token'],
          ttlSeconds: 300,
          body: { login: '{{ parameters.Login }}', values: ['[REDACTED]'] },
        },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      },
    },
    {
      name: 'selective branches with literal and parameter-based credentials',
      authentication: {
        type: 'selective',
        selectionParameter: 'Mode',
        authenticators: {
          bearer: {
            type: 'bearer',
            inject: { into: 'header', name: 'Authorization', format: 'Bearer private-value' },
          },
          basic: { type: 'basic', username: 'private-key' },
          apiKey: {
            type: 'apiKey',
            inject: { into: 'query', name: 'key', format: '{{ parameters.Value }}' },
          },
        },
      },
      expected: {
        type: 'selective',
        selectionParameter: 'Mode',
        authenticators: {
          bearer: {
            type: 'bearer',
            inject: { into: 'header', name: 'Authorization', format: '[REDACTED]' },
          },
          basic: { type: 'basic', username: '[REDACTED]' },
          apiKey: {
            type: 'apiKey',
            inject: { into: 'query', name: 'key', format: '{{ parameters.Value }}' },
          },
        },
      },
    },
  ])('masks $name', ({ authentication, expected }) => {
    const input = { manifest: { authentication } };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({ manifest: { authentication: expected } });
    expect(input).toEqual(original);
  });

  it('masks credential keys in unfinished authentication metadata', () => {
    const input = {
      manifest: {
        authentication: {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Value }}',
            extra: { Authorization: 'private-header', Region: 'eu' },
          },
        },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        authentication: {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Value }}',
            extra: { Authorization: '[REDACTED]', Region: 'eu' },
          },
        },
      },
    });
    expect(input).toEqual(original);
  });

  it.each([
    ['{{ parameters.Value }}', '{{ parameters.Value }}'],
    ['Bearer {{ parameters.Value }}', 'Bearer {{ parameters.Value }}'],
    ['ApiKey {{ parameters.Value }}', 'ApiKey {{ parameters.Value }}'],
    ['Bearer private-value{{ parameters.Value }}', '[REDACTED]'],
    ['{{ parameters.Value }}private-suffix', '[REDACTED]'],
    ['{{ unsupported.Value }}', '[REDACTED]'],
  ])(
    'handles authentication template %s without exposing literal credentials',
    (format, expected) => {
      expect(
        redactMcpTelemetry({
          manifest: {
            authentication: {
              type: 'bearer',
              inject: { into: 'header', name: 'Authorization', format },
            },
          },
        })
      ).toEqual({
        manifest: {
          authentication: {
            type: 'bearer',
            inject: { into: 'header', name: 'Authorization', format: expected },
          },
        },
      });
    }
  );

  it('masks literal manifest credentials while preserving request paths and ordinary query values', () => {
    const input = {
      manifest: {
        parameters: { AccessToken: { attributes: ['SECRET'], default: 'private-default' } },
        authentication: { type: 'bearer', token: 'private-auth' },
        nodes: {
          items: {
            request: {
              headers: { Authorization: 'Bearer private-header', 'X-Api-Key': 'private-key' },
              queryParameters: { api_key: 'private-query', page: 1 },
              path: '/items',
            },
          },
        },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: { AccessToken: { attributes: ['SECRET'], default: '[REDACTED]' } },
        authentication: { type: 'bearer', token: '[REDACTED]' },
        nodes: {
          items: {
            request: {
              headers: { Authorization: '[REDACTED]', 'X-Api-Key': '[REDACTED]' },
              queryParameters: { api_key: '[REDACTED]', page: 1 },
              path: '/items',
            },
          },
        },
      },
    });
    expect(input).toEqual(original);
  });

  it('masks secrets nested in oneOf options without hiding the selected choice', () => {
    const input = {
      manifest: {
        parameters: {
          Mode: {
            oneOf: [
              {
                value: 'service',
                items: {
                  Value: { attributes: ['SECRET'], default: 'private-default' },
                  Authorization: 'private-header',
                  ApiKey: { label: 'API key', default: 'private-key' },
                  TokenCount: { default: 100 },
                  Region: { default: 'eu' },
                },
              },
            ],
          },
        },
      },
      configuration: {
        Mode: { value: 'service', items: { Value: 'private-value', Region: 'eu' } },
      },
    };
    const original = structuredClone(input);

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Mode: {
            oneOf: [
              {
                value: 'service',
                items: {
                  Value: { attributes: ['SECRET'], default: '[REDACTED]' },
                  Authorization: '[REDACTED]',
                  ApiKey: { label: 'API key', default: '[REDACTED]' },
                  TokenCount: { default: 100 },
                  Region: { default: 'eu' },
                },
              },
            ],
          },
        },
      },
      configuration: { Mode: { value: 'service', items: { Value: '[REDACTED]', Region: 'eu' } } },
    });
    expect(input).toEqual(original);
  });

  it('protects flagged values even when parameter definitions are unfinished', () => {
    const input = {
      manifest: {
        parameters: {
          Value: { attributes: ['SECRET'], default: 'private-default', oneOf: 'unfinished' },
          Region: null,
        },
      },
      configuration: { Value: 'private-value', Region: 'eu' },
    };

    expect(redactMcpTelemetry(input)).toEqual({
      manifest: {
        parameters: {
          Value: { attributes: ['SECRET'], default: '[REDACTED]', oneOf: '[REDACTED]' },
          Region: null,
        },
      },
      configuration: { Value: '[REDACTED]', Region: 'eu' },
    });
  });
});
