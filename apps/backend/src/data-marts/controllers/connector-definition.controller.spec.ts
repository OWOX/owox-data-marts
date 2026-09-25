jest.mock('@owox/connectors', () => ({
  // An array, not an object: connector-definition.service builds a Set from it.
  AvailableConnectors: [],
  Core: {},
}));

// The decorators are no-ops here: these cases call the handlers directly.
jest.mock('../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  ViewOnlySafe: () => () => undefined,
}));

import { ConnectorDefinitionController } from './connector-definition.controller';
import { ConnectorMapper } from '../mappers/connector.mapper';
import type { AuthorizationContext } from '../../idp';

/**
 * A custom connector's specification and fields are served to every project member, as a
 * bundled connector's are, and must come out in the same shape: the bundled endpoint's mapper
 * leaves out what the form has no use for, `oneOf[].oauthParams` among it, and a manifest
 * author decides what those hold.
 */
describe('ConnectorDefinitionController specification and fields', () => {
  const ctx = { projectId: 'proj-1', userId: 'u', roles: ['viewer'] } as AuthorizationContext;

  const controller = () =>
    new ConnectorDefinitionController(
      {
        getById: jest.fn().mockResolvedValue({ id: 'def-1', name: 'MyCustom' }),
        resolveManifest: jest.fn().mockResolvedValue({}),
      } as never,
      {
        getSpecificationFromManifest: jest.fn().mockReturnValue([
          {
            name: 'AuthType',
            oneOf: [
              {
                label: 'OAuth',
                value: 'oauth2',
                oauthParams: { clientSecret: 'written into the manifest' },
                items: { Token: { name: 'Token', attributes: ['SECRET'] } },
              },
            ],
          },
        ]),
        getFieldsSchemaFromManifest: jest
          .fn()
          .mockReturnValue([
            { name: 'items', fields: [{ name: 'id', type: 'STRING', internal: 'x' }] },
          ]),
      } as never,
      {} as never,
      {} as never,
      new ConnectorMapper()
    );

  it('serves the specification without oauthParams', async () => {
    const [authType] = await controller().specification(ctx, 'def-1');

    expect(authType.oneOf?.[0]).not.toHaveProperty('oauthParams');
    expect(authType.oneOf?.[0].items.Token).toMatchObject({ name: 'Token' });
  });

  it('serves the fields the way the bundled endpoint does', async () => {
    const [node] = await controller().fields(ctx, 'def-1');

    expect(node.fields?.[0]).toEqual({ name: 'id', type: 'STRING', description: undefined });
  });
});
