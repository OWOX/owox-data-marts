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
