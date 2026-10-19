jest.mock('snowflake-sdk', () => ({}));
import { ConnectorManifestStaticValidationService } from './connector-manifest-static-validation.service';
const valid = () => ({
  version: '1.0',
  name: 'Custom',
  baseUrl: 'https://api.example.com',
  parameters: {},
  nodes: {
    items: {
      request: { method: 'GET', path: '/items' },
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      recordSelector: { recordPath: [] },
    },
  },
});
describe('ConnectorManifestStaticValidationService', () => {
  const service = new ConnectorManifestStaticValidationService();
  const codes = (manifest: Record<string, unknown>) =>
    service.validate(manifest, 'Custom').map(issue => issue.code);
  it('uses the real parser and publish-time schema checks', () => {
    expect(codes(valid())).toEqual([]);
    expect(
      codes({ ...valid(), nodes: { items: { ...valid().nodes.items, uniqueKeys: [] } } })
    ).toContain('primary_key_required');
    expect(
      codes({ ...valid(), parameters: { Token: { requiredType: 'invalid-type' } } })
    ).toContain('runtime_schema_invalid');
  });
  it('checks UTF-8 bytes rather than characters at the exact boundary', () => {
    const manifest = { ...valid(), description: '' };
    const space = 120 * 1024 - Buffer.byteLength(JSON.stringify(manifest));
    manifest.description = 'x'.repeat(space);
    expect(codes(manifest)).not.toContain('manifest_too_large');
    manifest.description = 'x'.repeat(space - 1) + '€';
    expect(codes(manifest)).toContain('manifest_too_large');
  });
  it.each([
    {
      type: 'bearer',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer raw-secret' },
    },
    { type: 'basic', username: 'literal-api-token' },
    {
      type: 'oauth2',
      tokenUrl: 'https://api.example.com/oauth',
      clientId: 'public',
      clientSecret: 'raw-secret',
      grantType: 'client_credentials',
    },
    {
      type: 'selective',
      selectionParameter: 'AuthType',
      authenticators: {
        bearer: {
          type: 'bearer',
          inject: { into: 'header', name: 'Authorization', format: 'raw-secret' },
        },
      },
    },
  ])('rejects literal auth secrets without copying them to diagnostics', authentication => {
    const result = service.validate({ ...valid(), authentication }, 'Custom');
    expect(result.map(issue => issue.code)).toContain('literal_auth_secret');
    expect(JSON.stringify(result)).not.toMatch(/raw-secret|literal-api-token/);
  });
  it('accepts explicit Secret parameter references and rejects defaults and implicit marking', () => {
    const authentication = {
      type: 'bearer',
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
    };
    const parameters = {
      Token: { requiredType: 'string', label: 'Token', attributes: ['SECRET'] },
    };
    expect(codes({ ...valid(), authentication, parameters })).toEqual([]);
    expect(
      codes({
        ...valid(),
        authentication,
        parameters: { Token: { ...parameters.Token, default: 'raw-secret' } },
      })
    ).toContain('secret_parameter_value');
    expect(
      codes({ ...valid(), authentication, parameters: { Token: { requiredType: 'string' } } })
    ).toContain('secret_parameter_required');
  });
  it('never returns arbitrary embedded secrets or parser error values', () => {
    const result = service.validate(
      {
        ...valid(),
        baseUrl: 'arbitrary-secret-location',
        arbitrary: { innocuous: 'arbitrary-secret-value' },
      },
      'Custom'
    );
    expect(result.map(issue => issue.code)).toContain('manifest_invalid');
    expect(JSON.stringify(result)).not.toMatch(/arbitrary-secret/);
  });
  it('allows token-exchange protocol literals while rejecting literal credential fields', () => {
    const authentication = {
      type: 'tokenExchange',
      exchange: {
        url: 'https://api.example.com/token',
        method: 'POST',
        tokenPath: ['token'],
        body: {
          grant_type: 'client_credentials',
          client_id: 'public-client',
          client_secret: '{{ parameters.Token }}',
        },
      },
      inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
    };
    const parameters = {
      Token: { label: 'Token', requiredType: 'string', attributes: ['SECRET'] },
    };
    expect(codes({ ...valid(), authentication, parameters })).toEqual([]);
    expect(
      codes({
        ...valid(),
        authentication: {
          ...authentication,
          exchange: {
            ...authentication.exchange,
            body: { ...authentication.exchange.body, client_secret: 'literal-token' },
          },
        },
        parameters,
      })
    ).toContain('literal_auth_secret');
  });
  it.each([null, [], 'untrusted-value'])(
    'rejects non-object stored values without unsafe diagnostic bodies',
    raw => {
      expect(service.validate(raw as never, 'Custom')).toEqual([
        {
          code: 'manifest_invalid',
          message:
            'The stored manifest fails runtime authoring validation. Inspect it in the application.',
        },
      ]);
    }
  );
  it.each([
    { title: 'x'.repeat(256) },
    { docUrl: 'x'.repeat(256) },
    { description: '€'.repeat(21846) },
  ])('rejects manifest metadata that the publication columns cannot hold', metadata => {
    expect(codes({ ...valid(), ...metadata })).toContain('metadata_too_large');
  });
  it('rejects literal authorization headers in runtime requests without rejecting Secret templates', () => {
    const withHeader = (format: string) => ({
      ...valid(),
      parameters: { Token: { label: 'Token', requiredType: 'string', attributes: ['SECRET'] } },
      nodes: {
        items: {
          ...valid().nodes.items,
          request: { ...valid().nodes.items.request, headers: { Authorization: format } },
        },
      },
    });
    expect(codes(withHeader('Bearer literal-request-token'))).toContain('literal_auth_secret');
    expect(codes(withHeader('Bearer {{ parameters.Token }}'))).toEqual([]);
  });
  it('checks stable connector identity', () => {
    expect(codes({ ...valid(), name: 'Other' })).toContain('source_name_mismatch');
  });
});
