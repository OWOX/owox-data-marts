import { McpContextsFacadeImpl } from './mcp-contexts.facade.impl';
import type { ContextService } from '../services/context/context.service';

describe('McpContextsFacadeImpl', () => {
  const service = {
    listForMcp: jest.fn(),
    validateContextIds: jest.fn(),
    getDataMartContextSummaries: jest.fn(),
  };
  const facade = new McpContextsFacadeImpl(service as unknown as ContextService);
  it('delegates reads to project-scoped services without provisioning or mutations', async () => {
    const description = '# Marketing\n' + 'long goal '.repeat(2000);
    service.listForMcp.mockResolvedValue([
      { id: 'c', name: 'Marketing', description },
      { id: 'empty', name: 'Empty', description: null },
    ]);
    expect(await facade.listContexts('project')).toEqual([
      { id: 'c', name: 'Marketing', description },
      { id: 'empty', name: 'Empty', description: null },
    ]);
    expect(service.listForMcp).toHaveBeenCalledWith('project');
    service.getDataMartContextSummaries.mockResolvedValue({ dm: [{ id: 'c', name: 'Marketing' }] });
    expect(await facade.getDataMartContexts('project', ['dm'])).toEqual({
      dm: [{ id: 'c', name: 'Marketing' }],
    });
    expect(service.getDataMartContextSummaries).toHaveBeenCalledWith('project', ['dm']);
  });
  it('deduplicates IDs before project validation and propagates failures', async () => {
    await facade.validateContextIds('project', ['c', 'c']);
    expect(service.validateContextIds).toHaveBeenCalledWith(['c'], 'project');
    service.validateContextIds.mockRejectedValueOnce(new Error('foreign project'));
    await expect(facade.validateContextIds('project', ['foreign'])).rejects.toThrow(
      'foreign project'
    );
  });
});
