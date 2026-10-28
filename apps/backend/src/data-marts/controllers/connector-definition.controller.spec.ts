import { ConnectorDefinitionMapper } from '../mappers/connector-definition.mapper';
import { GetCustomConnectorSpecificationService } from '../use-cases/custom-connectors/get-custom-connector-specification.service';
import { GetCustomConnectorFieldsService } from '../use-cases/custom-connectors/get-custom-connector-fields.service';
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

  const controller = () => {
    const definitions = {
      getById: jest.fn().mockResolvedValue({ id: 'def-1', name: 'MyCustom' }),
      resolveManifest: jest.fn().mockResolvedValue({}),
    };
    const connectors = {
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
    };
    return new ConnectorDefinitionController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new GetCustomConnectorSpecificationService(
        definitions as never,
        connectors as never,
        new ConnectorMapper()
      ),
      new GetCustomConnectorFieldsService(
        definitions as never,
        connectors as never,
        new ConnectorMapper()
      ),
      {} as never,
      new ConnectorDefinitionMapper(),
      new ConnectorMapper()
    );
  };

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

describe('ConnectorDefinitionController response boundary', () => {
  it('projects domain metadata and version summaries before returning them over HTTP', async () => {
    const metadata = {
      id: 'def-1',
      name: 'Demo',
      title: 'Demo',
      description: null,
      logo: 'logo',
      docUrl: null,
      activeVersionId: null,
      activeVersion: null,
    };
    const version = { version: 1, status: 'draft' as const, publishedAt: null };
    const domain = {
      ...metadata,
      projectId: 'private-project',
      createdById: 'private-user',
      manifest: { token: 'private-token' },
      versions: [{ ...version, manifest: { token: 'private-token' } }],
    };
    const controller = new ConnectorDefinitionController(
      { run: jest.fn().mockResolvedValue([domain]) } as never,
      { run: jest.fn().mockResolvedValue(domain) } as never,
      {} as never,
      { run: jest.fn().mockResolvedValue(domain) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConnectorDefinitionMapper(),
      new ConnectorMapper()
    );
    const ctx = { projectId: 'proj-1', userId: 'u', roles: ['viewer'] } as AuthorizationContext;
    expect(await controller.list(ctx)).toEqual([metadata]);
    expect(await controller.get(ctx, 'def-1')).toEqual({ ...metadata, versions: [version] });
    expect(await controller.update(ctx, 'def-1', {})).toEqual({ ...metadata, versions: [version] });
  });
});
