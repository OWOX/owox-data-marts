import type { AuthorizationContext } from '../../../idp';
import { PluginCollectionValidationError } from '../errors/plugin-collection.errors';
import { PluginCollectionMapper } from './plugin-collection.mapper';

describe('PluginCollectionMapper', () => {
  const context = {
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    authFlow: 'plugin',
    pluginId: 'plugin-1',
    installationId: 'installation-1',
  } as AuthorizationContext;

  it('rejects JSON deeper than the stack-safe collection limit', () => {
    let document: Record<string, unknown> = {};
    for (let depth = 0; depth <= 100; depth += 1) document = { child: document };

    expect(() =>
      new PluginCollectionMapper().toPutCommand('settings', 'document-1', { document }, context)
    ).toThrow(PluginCollectionValidationError);
  });

  it.each(['.', '..'])('rejects document id path segment %s', documentId => {
    expect(() =>
      new PluginCollectionMapper().toGetCommand('settings', documentId, context)
    ).toThrow(PluginCollectionValidationError);
  });
});
