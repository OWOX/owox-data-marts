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

  it('builds a test command without a credential unless the caller selects one', () => {
    const input = { manifest: { name: 'CustomApi' }, node: 'items', configuration: { a: 1 } };
    const command = mapper.toTestCommand('project', input);
    expect(command.credential).toBeUndefined();
    expect(command.input).toMatchObject(input);
    expect(mapper.toTestCommand('project', input, { userId: 'editor' }).credential).toBeUndefined();
    expect(
      mapper.toTestCommand('project', input, { credentialId: 'cred', userId: 'editor' }).credential
    ).toEqual({ credentialId: 'cred', userId: 'editor', roles: [] });
  });

  it('builds the fitting command from the body and the caller', () => {
    const body = {
      connectorName: 'CustomApi',
      version: 2,
      node: 'items',
      selection: 'a',
      extra: 1,
    };
    expect(
      mapper.toFittingCredentialsCommand({ projectId: 'project', userId: 'editor' }, body)
    ).toEqual({
      projectId: 'project',
      userId: 'editor',
      roles: [],
      query: { connectorName: 'CustomApi', version: 2, node: 'items', selection: 'a' },
    });
  });

  it('keeps the fitting and requirement response shapes', () => {
    const withExtra = { id: 'c', title: 'T', hosts: ['h'], fieldKeys: ['k'], extra: 1 };
    expect(mapper.toFittingCredentialsApiResponse([withExtra])).toEqual([
      { id: 'c', title: 'T', hosts: ['h'], fieldKeys: ['k'] },
    ]);
    expect(
      mapper.toCredentialRequirementApiResponse({
        hosts: ['h'],
        fieldList: [{ key: 'K', label: 'L', secret: true, required: false }],
        keyParameters: ['K'],
        misuse: ['M'],
      })
    ).toEqual({
      hosts: ['h'],
      fieldList: [{ key: 'K', label: 'L', secret: true, required: false }],
      keyParameters: ['K'],
      misuse: ['M'],
    });
  });
});
