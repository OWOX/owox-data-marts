import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ConnectorDeleteTool } from './connector-delete.tool';

describe('ConnectorDeleteTool', () => {
  const authoring = { deleteConnector: jest.fn() };
  const tool = new ConnectorDeleteTool(authoring as never);

  beforeEach(() => jest.clearAllMocks());

  it('is named connector_delete and is flagged destructive', () => {
    expect(tool.name).toBe('connector_delete');
    expect(tool.annotations.destructiveHint).toBe(true);
    expect(tool.requiredScopes).toEqual(['mcp:write']);
  });

  it('rejects input without connector_id', () => {
    expect(() => tool.parseInput({})).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => tool.parseInput({ connector_id: 'def-1', force: true })).toThrow();
  });

  it('passes the auth context and connector id to the facade, and returns the structured result', async () => {
    authoring.deleteConnector.mockResolvedValue({ connectorId: 'def-1', deleted: true });

    const structuredContent = { connector_id: 'def-1', deleted: true };
    await expect(
      tool.handler({ connector_id: 'def-1' }, {
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
      } as never)
    ).resolves.toEqual({
      structuredContent,
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    });

    expect(authoring.deleteConnector).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      connectorId: 'def-1',
    });
  });

  it('surfaces the referencing data mart ids when the connector is still in use', async () => {
    authoring.deleteConnector.mockRejectedValue(
      new BusinessViolationException(
        'Cannot delete the connector because it is referenced by existing data marts.',
        { referencedDataMarts: ['dm-1', 'dm-2'] }
      )
    );

    const result = await tool.handler({ connector_id: 'def-1' }, {
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
    } as never);

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('dm-1');
    expect(text).toContain('dm-2');
  });
});
