import { ConnectorSetVersionTool } from './connector-set-version.tool';

describe('ConnectorSetVersionTool', () => {
  const authoring = { setConnectorVersion: jest.fn() };
  const tool = new ConnectorSetVersionTool(authoring as never);

  beforeEach(() => jest.clearAllMocks());

  it('is a write-scoped connector_set_version tool', () => {
    expect(tool.name).toBe('connector_set_version');
    expect(tool.requiredScopes).toEqual(['mcp:write']);
  });

  it('rejects a non-positive version', () => {
    expect(() => tool.parseInput({ connector_id: 'def-1', version: 0 })).toThrow();
  });

  it('rejects a missing version', () => {
    expect(() => tool.parseInput({ connector_id: 'def-1' })).toThrow();
  });

  it('passes connector id and version to the facade', async () => {
    authoring.setConnectorVersion.mockResolvedValue({ connectorId: 'def-1', activeVersion: 2 });

    await tool.handler({ connector_id: 'def-1', version: 2 }, {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(authoring.setConnectorVersion).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
      version: 2,
    });
  });
});
