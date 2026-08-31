import { ConnectorService } from './connector.service';

describe('ConnectorService manifest helpers', () => {
  const manifest = {
    version: '1.0',
    name: 'MyCustom',
    baseUrl: 'https://api.example.com',
    parameters: { Token: { requiredType: 'string', isRequired: true, label: 'API Token' } },
    nodes: {
      items: {
        fields: { id: { type: 'string' }, name: { type: 'string' } },
        uniqueKeys: ['id'],
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: [] },
      },
    },
  };

  const service = new ConnectorService({} as never, {} as never);

  it('getSpecificationFromManifest maps parameters', () => {
    const spec = service.getSpecificationFromManifest(manifest);
    const token = spec.find(p => p.name === 'Token');
    expect(token).toBeDefined();
    expect(token?.requiredType).toBe('string');
    expect(token?.required).toBe(true);
  });

  it('getFieldsSchemaFromManifest maps nodes/fields', () => {
    const fields = service.getFieldsSchemaFromManifest(manifest);
    const node = fields.find(n => n.name === 'items');
    expect(node).toBeDefined();
    const names = (node?.fields ?? []).map(f => f.name);
    expect(names).toContain('id');
    expect(names).toContain('name');
  });

  it('throws on an invalid manifest', () => {
    expect(() => service.getSpecificationFromManifest({ not: 'valid' } as never)).toThrow();
  });
});

/**
 * GET /connectors/custom/:id/specification is @Auth(Role.viewer()) and MCP `connector_details`
 * needs only `mcp:read`, while the manifest they are derived from is editor-only. That split
 * only holds while the derived spec carries nothing the manifest was restricted for, and a
 * SECRET parameter's `default` is exactly such a thing: the config form ASSIGNS it as the
 * parameter's value, so an author who pre-fills a shared token there has published it to
 * every project member.
 */
describe('ConnectorService withholds SECRET parameter values from the specification', () => {
  const service = new ConnectorService({} as never, {} as never);

  const manifestWith = (parameters: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({
      version: '1.0',
      name: 'MyCustom',
      baseUrl: 'https://api.example.com',
      parameters,
      nodes: {
        items: {
          fields: { id: { type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
        },
      },
      ...extra,
    }) as Record<string, unknown>;

  it('drops default, placeholder and options from an explicitly SECRET parameter', () => {
    const spec = service.getSpecificationFromManifest(
      manifestWith({
        ApiKey: {
          requiredType: 'string',
          isRequired: true,
          label: 'API Key',
          description: 'The key issued by the vendor',
          attributes: ['SECRET'],
          default: 'sk-live-REAL-CREDENTIAL',
          placeholder: 'sk-live-REAL-CREDENTIAL',
          options: ['sk-live-REAL-CREDENTIAL'],
        },
      })
    );

    const apiKey = spec.find(p => p.name === 'ApiKey');
    expect(apiKey).toBeDefined();
    expect(apiKey?.default).toBeUndefined();
    expect(apiKey?.placeholder).toBeUndefined();
    expect(apiKey?.options).toBeUndefined();
    // Everything the config form needs to RENDER the field survives — the withholding is
    // about values, not about hiding the parameter.
    expect(apiKey?.required).toBe(true);
    expect(apiKey?.requiredType).toBe('string');
    expect(apiKey?.title).toBe('API Key');
    expect(apiKey?.description).toBe('The key issued by the vendor');
    expect(apiKey?.attributes).toContain('SECRET');
  });

  it('leaves an ordinary parameter its default and placeholder', () => {
    const spec = service.getSpecificationFromManifest(
      manifestWith({
        PageSize: {
          requiredType: 'number',
          label: 'Page size',
          default: 100,
          placeholder: '100',
        },
      })
    );

    const pageSize = spec.find(p => p.name === 'PageSize');
    expect(pageSize?.default).toBe(100);
    expect(pageSize?.placeholder).toBe('100');
  });

  it('keys off the attributes ManifestParser ends up with, not the ones the author typed', () => {
    // `Token` is never marked SECRET by the author; the parser marks it because
    // `authentication` interpolates it. The withholding has to see the marked copy.
    const spec = service.getSpecificationFromManifest(
      manifestWith(
        { Token: { requiredType: 'string', label: 'Token', default: 'ghp_REAL_CREDENTIAL' } },
        {
          authentication: {
            type: 'bearer',
            inject: {
              into: 'header',
              name: 'Authorization',
              format: 'Bearer {{ parameters.Token }}',
            },
          },
        }
      )
    );

    const token = spec.find(p => p.name === 'Token');
    expect(token?.attributes).toContain('SECRET');
    expect(token?.default).toBeUndefined();
  });

  it('withholds nested oneOf item values too, where auth credentials usually live', () => {
    const spec = service.getSpecificationFromManifest(
      manifestWith({
        AuthType: {
          requiredType: 'string',
          label: 'Authentication',
          oneOf: [
            {
              label: 'API key',
              value: 'apiKey',
              items: {
                ClientSecret: {
                  requiredType: 'string',
                  label: 'Client secret',
                  attributes: ['SECRET'],
                  default: 'nested-REAL-CREDENTIAL',
                  placeholder: 'nested-REAL-CREDENTIAL',
                },
                ClientId: {
                  requiredType: 'string',
                  label: 'Client id',
                  default: 'public-client-id',
                },
              },
            },
          ],
        },
      })
    );

    const branch = spec.find(p => p.name === 'AuthType')?.oneOf?.[0];
    expect(branch?.items.ClientSecret.default).toBeUndefined();
    expect(branch?.items.ClientSecret.placeholder).toBeUndefined();
    // A non-secret sibling in the same branch is untouched.
    expect(branch?.items.ClientId.default).toBe('public-client-id');
  });
});
