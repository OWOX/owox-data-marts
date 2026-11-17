import { ListCustomConnectorSummariesCommand } from '../../dto/domain/list-custom-connector-summaries.command';
import { ConnectorDefinitionMapper } from '../../mappers/connector-definition.mapper';
import { ListCustomConnectorSummariesService } from './list-custom-connector-summaries.service';

const manifest = (name: string, baseUrl: string) => ({
  version: '1.0',
  name,
  baseUrl,
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
});

const def = (name: string, logo: string | null = null) => ({
  id: `id-${name}`,
  name,
  title: `Title ${name}`,
  logo,
});

describe('ListCustomConnectorSummariesService', () => {
  const make = (defs: object[], manifests: Record<string, Record<string, unknown>>) => {
    const definitions = {
      listByProject: jest.fn().mockResolvedValue(defs),
      getActiveManifestsByDefId: jest.fn().mockResolvedValue(new Map(Object.entries(manifests))),
    };
    const service = new ListCustomConnectorSummariesService(
      definitions as never,
      new ConnectorDefinitionMapper()
    );
    return { service, definitions };
  };
  const command = (names?: string[]) => new ListCustomConnectorSummariesCommand('proj', names);

  it('returns every connector with id, name, title, logo and hosts when names is absent', async () => {
    const { service } = make([def('Alpha', 'data:logo'), def('Beta')], {
      'id-Alpha': manifest('Alpha', 'https://API.Example.com/v1'),
      'id-Beta': manifest('Beta', 'https://beta.example.com'),
    });

    expect(await service.run(command())).toEqual([
      {
        id: 'id-Alpha',
        name: 'Alpha',
        title: 'Title Alpha',
        logo: 'data:logo',
        hosts: ['api.example.com'],
      },
      {
        id: 'id-Beta',
        name: 'Beta',
        title: 'Title Beta',
        logo: null,
        hosts: ['beta.example.com'],
      },
    ]);
  });

  it('keeps only the named connectors, ignoring case, blanks and unknown names', async () => {
    const { service, definitions } = make(
      [def('FiberyOwox'), def('FiberyContracts'), def('Stripe2')],
      {}
    );

    const result = await service.run(command([' FIBERYOWOX ', '', 'Nope']));

    expect(result.map(item => item.name)).toEqual(['FiberyOwox']);
    expect(definitions.getActiveManifestsByDefId).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'FiberyOwox' }),
    ]);
  });

  it('returns every connector when names holds no non-blank name', async () => {
    const { service } = make([def('Alpha'), def('Beta')], {});

    expect(await service.run(command(['', ' ']))).toHaveLength(2);
  });

  it('gives empty hosts to a connector with no active published version', async () => {
    const { service } = make([def('Alpha')], {});

    expect((await service.run(command()))[0].hosts).toEqual([]);
  });

  it('lists the hosts of baseUrl and the token URL in parser order', async () => {
    const { service } = make([def('Alpha')], {
      'id-Alpha': {
        ...manifest('Alpha', 'https://api.alpha.example'),
        authentication: {
          type: 'oauth2',
          tokenUrl: 'https://oauth.alpha.example/token',
          clientId: '{{ parameters.ClientId }}',
          clientSecret: '{{ parameters.ClientSecret }}',
          refreshToken: '{{ parameters.RefreshToken }}',
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
        parameters: {
          ClientId: { requiredType: 'string', isRequired: true, label: 'Client ID' },
          ClientSecret: { requiredType: 'string', isRequired: true, label: 'Client Secret' },
          RefreshToken: { requiredType: 'string', isRequired: true, label: 'Refresh Token' },
        },
      },
    });

    expect((await service.run(command()))[0].hosts).toEqual([
      'api.alpha.example',
      'oauth.alpha.example',
    ]);
  });

  it('gives empty hosts to a connector whose manifest the parser refuses and keeps the others', async () => {
    const { nodes: _nodes, ...withoutNodes } = manifest('Alpha', 'https://alpha.example.com');
    const { service } = make([def('Alpha'), def('Beta')], {
      'id-Alpha': withoutNodes,
      'id-Beta': manifest('Beta', 'https://beta.example.com'),
    });

    const result = await service.run(command());

    expect(result.map(item => item.hosts)).toEqual([[], ['beta.example.com']]);
  });
});
