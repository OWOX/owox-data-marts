import type { McpAuthContext } from '../auth/mcp-auth-context';
import { ConnectorManifestSchemaTool } from './connector-manifest-schema.tool';
import { MANIFEST_SCHEMA_REFERENCE, MANIFEST_SCHEMA_VERSION } from './manifest-schema.reference';

const context: McpAuthContext = {
  clientId: 'c1',
  userId: 'user-1',
  projectId: 'project-1',
  roles: ['viewer'],
  resource: 'https://mcp.owox.com/mcp',
  scopes: ['mcp:read'],
  authFlow: 'mcp',
};

it('returns the manifest schema reference', async () => {
  const tool = new ConnectorManifestSchemaTool();
  const structuredContent = {
    reference_markdown: MANIFEST_SCHEMA_REFERENCE,
    version: MANIFEST_SCHEMA_VERSION,
  };
  await expect(tool.handler({}, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
});

it('is read-only and requires mcp:read', () => {
  const tool = new ConnectorManifestSchemaTool();
  expect(tool.requiredScopes).toEqual(['mcp:read']);
  expect(tool.annotations?.readOnlyHint).toBe(true);
  expect(tool.name).toBe('connector_manifest_schema');
});

it('rejects unexpected input', () => {
  const tool = new ConnectorManifestSchemaTool();
  expect(() => tool.parseInput({ foo: 'x' })).toThrow();
});
