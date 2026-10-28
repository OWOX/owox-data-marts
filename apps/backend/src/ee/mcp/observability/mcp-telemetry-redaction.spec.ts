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
          Value: { attributes: ['SECRET'], default: '[REDACTED]', oneOf: 'unfinished' },
          Region: null,
        },
      },
      configuration: { Value: '[REDACTED]', Region: 'eu' },
    });
  });
});
