import { ConnectorVersionsTool } from './connector-versions.tool';

describe('ConnectorVersionsTool', () => {
  const authoring = { listConnectorVersions: jest.fn() };
  const tool = new ConnectorVersionsTool(authoring as never);

  beforeEach(() => jest.clearAllMocks());

  it('is a read-only connector_versions tool', () => {
    expect(tool.name).toBe('connector_versions');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.requiredScopes).toEqual(['mcp:read']);
  });

  it('rejects unknown keys', () => {
    expect(() => tool.parseInput({ connector_id: 'def-1', all: true })).toThrow();
  });

  it('returns the facade versions', async () => {
    authoring.listConnectorVersions.mockResolvedValue({
      versions: [{ version: 1, status: 'PUBLISHED', publishedAt: null, isActive: true }],
    });

    const result = await tool.handler({ connector_id: 'def-1' }, {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
    } as never);

    expect(result.structuredContent).toEqual({
      versions: [{ version: 1, status: 'PUBLISHED', publishedAt: null, isActive: true }],
    });
  });
});
