import { ListFittingCustomConnectorCredentialsCommand } from '../../dto/domain/list-fitting-custom-connector-credentials.command';
import { ListFittingCustomConnectorCredentialsService } from './list-fitting-custom-connector-credentials.service';

const manifest = {
  version: '1.0',
  name: 'KeyedApi',
  baseUrl: 'https://api.example.com',
  authentication: {
    type: 'apiKey',
    inject: { into: 'header', name: 'X-Key', format: '{{ parameters.ApiKey }}' },
  },
  parameters: { ApiKey: { requiredType: 'string', isRequired: true, label: 'Key' } },
  nodes: {
    items: {
      fields: { id: { type: 'string' } },
      uniqueKeys: ['id'],
      request: { method: 'GET', path: '/items' },
      recordSelector: { recordPath: [] },
    },
  },
};

const credential = (
  id: string,
  hosts: string[],
  definitionId = 'custom-connector',
  fieldList: object[] = [{ key: 'ApiKey' }]
) => ({
  id,
  title: `Title ${id}`,
  definitionId,
  publicMetadata: { hosts, fieldList, fields: {} },
});

describe('ListFittingCustomConnectorCredentialsService', () => {
  const make = (rows: object[], usable: string[]) => {
    const credentials = { listEnabledCustomConnectorPublic: jest.fn().mockResolvedValue(rows) };
    const access = {
      canAccessMany: jest.fn(
        async (_u: string, _r: string[], _t: unknown, ids: string[]) =>
          new Map(ids.map(id => [id, usable.includes(id)]))
      ),
    };
    const definitions = { tryResolveManifest: jest.fn().mockResolvedValue(null) };
    const tests = { pruneToNode: jest.fn((m: Record<string, unknown>) => m) };
    const service = new ListFittingCustomConnectorCredentialsService(
      credentials as never,
      access as never,
      definitions as never,
      tests as never
    );
    return { service, access, definitions };
  };
  const command = (query: object) =>
    new ListFittingCustomConnectorCredentialsCommand('proj', 'user', ['editor'], query);

  it('lists the Credentials the member can use with why they cannot be chosen, without values', async () => {
    const { service } = make(
      [
        credential('fit-ok', ['api.example.com']),
        credential('fit-denied', ['api.example.com']),
        credential('other-host', ['api.other.com']),
        credential('public-key', ['api.example.com'], 'custom-connector', [
          { key: 'ApiKey', label: 'Key', secret: false },
        ]),
        credential('other-definition', ['api.example.com'], 'google-ads'),
      ],
      ['fit-ok', 'other-host', 'public-key', 'other-definition']
    );

    const result = await service.run(command({ manifest }));

    expect(result).toEqual([
      {
        id: 'fit-ok',
        title: 'Title fit-ok',
        hosts: ['api.example.com'],
        fieldKeys: ['ApiKey'],
        refusal: null,
      },
      {
        id: 'other-host',
        title: 'Title other-host',
        hosts: ['api.other.com'],
        fieldKeys: ['ApiKey'],
        refusal: {
          reason: 'unfit',
          message: 'This Credential cannot be used with this connector.',
        },
      },
      {
        id: 'public-key',
        title: 'Title public-key',
        hosts: ['api.example.com'],
        fieldKeys: ['ApiKey'],
        refusal: {
          reason: 'secret',
          message: 'This Credential keeps Key as a public field; this connector needs it secret.',
        },
      },
    ]);
  });

  it('asks access only about custom connector Credentials', async () => {
    const { service, access } = make(
      [
        credential('fit', ['api.example.com']),
        credential('unfit', ['api.other.com']),
        credential('other-definition', ['api.example.com'], 'google-ads'),
      ],
      ['fit']
    );

    await service.run(command({ manifest }));

    expect(access.canAccessMany.mock.calls[0][3]).toEqual(['fit', 'unfit']);
  });

  it('describes what a new Credential must hold to fit', async () => {
    const { service } = make([], []);

    await expect(service.requirement(command({ manifest }))).resolves.toEqual({
      hosts: ['api.example.com'],
      fieldList: [{ key: 'ApiKey', label: 'Key', secret: true, required: true }],
      keyParameters: ['ApiKey'],
      misuse: [],
    });
  });

  it('carries the run error for a key parameter used where no request is built', async () => {
    const { service } = make([], []);
    const leaky = {
      ...manifest,
      nodes: {
        items: {
          ...manifest.nodes.items,
          transformations: [{ type: 'add', field: 'label', value: '{{ parameters.ApiKey }}' }],
        },
      },
    };

    await expect(service.requirement(command({ manifest: leaky }))).resolves.toMatchObject({
      misuse: ['Key parameter "ApiKey" cannot be used in transformations.add of node "items"'],
    });
  });

  it('refuses a query with both or neither of manifest and connectorName', async () => {
    const { service } = make([], []);

    await expect(service.run(command({}))).rejects.toThrow('either a manifest or a connectorName');
    await expect(service.run(command({ manifest, connectorName: 'X' }))).rejects.toThrow(
      'either a manifest or a connectorName'
    );
  });

  it('answers not found for an unknown connector name', async () => {
    const { service } = make([], []);

    await expect(service.run(command({ connectorName: 'Nope' }))).rejects.toThrow('not found');
  });
});
