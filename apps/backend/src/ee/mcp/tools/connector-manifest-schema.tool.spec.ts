import type { McpAuthContext } from '../auth/mcp-auth-context';
import { ConnectorManifestSchemaTool } from './connector-manifest-schema.tool';
import {
  MANIFEST_SCHEMA_REFERENCE,
  MANIFEST_SCHEMA_VERSION,
  MCP_MANIFEST_REFERENCE,
} from './manifest-schema.reference';

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
    reference_markdown: MCP_MANIFEST_REFERENCE,
    version: MANIFEST_SCHEMA_VERSION,
  };
  await expect(tool.handler({}, context)).resolves.toEqual({
    structuredContent,
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
  });
});

// The published reference is written for an assistant without tools, whose user imports and
// tests the manifest. An assistant on MCP does that itself, so it gets the tool steps too.
it('follows the published reference with the steps an MCP assistant runs itself', () => {
  expect(MCP_MANIFEST_REFERENCE.startsWith(MANIFEST_SCHEMA_REFERENCE)).toBe(true);
  const workflow = MCP_MANIFEST_REFERENCE.slice(MANIFEST_SCHEMA_REFERENCE.length);
  expect(workflow).toContain('connector_test');
  expect(workflow).toContain('connector_publish');
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
