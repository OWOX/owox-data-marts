import { ConnectorDefinitionMapper } from './connector-definition.mapper';

describe('ConnectorDefinitionMapper commands', () => {
  const mapper = new ConnectorDefinitionMapper();
  const actor = { projectId: 'project', userId: 'editor' };

  it('takes creation identity from the actor and maps only connector input fields', () => {
    const input = {
      name: 'CustomApi',
      title: 'Custom API',
      manifest: { name: 'CustomApi' },
      projectId: 'other-project',
      userId: 'other-user',
    };
    expect(mapper.toCreateCommand(actor, input)).toEqual({
      projectId: 'project',
      userId: 'editor',
      input: {
        name: 'CustomApi',
        title: 'Custom API',
        manifest: { name: 'CustomApi' },
        description: null,
        logo: null,
        docUrl: null,
      },
    });
  });

  it('preserves omitted metadata separately from an explicit null', () => {
    expect(
      mapper.toUpdateMetadataCommand('project', 'connector', { description: null }).input
    ).toStrictEqual({ description: null });
    expect(mapper.toUpdateMetadataCommand('project', 'connector', {}).input).toStrictEqual({});
  });

  it('preserves the authenticated actor and normalizes absent roles for version changes', () => {
    expect(mapper.toPublishCommand(actor, 'connector')).toEqual({
      projectId: 'project',
      connectorId: 'connector',
      userId: 'editor',
      roles: [],
    });
    expect(mapper.toActivateCommand({ ...actor, roles: ['admin'] }, 'connector', 2)).toEqual({
      projectId: 'project',
      connectorId: 'connector',
      version: 2,
      userId: 'editor',
      roles: ['admin'],
    });
    expect(mapper.toActivateCommand(actor, 'connector', 1).roles).toEqual([]);
  });
});
