jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { McpDataMartSetupFacadeImpl } from './mcp-data-mart-setup.facade.impl';

describe('McpDataMartSetupFacadeImpl', () => {
  it.each(['list', 'get', 'validate', 'impact'] as const)(
    'delegates %s to the domain use case and preserves failures',
    async method => {
      const request = {
        projectId: 'project',
        userId: 'user',
        roles: ['editor'],
        dataMartId: 'dm',
        limit: 10,
        mode: 'static',
        action: 'delete',
      };
      const result = { outcome: 'stored observation' };
      const service = { [method]: jest.fn().mockResolvedValue(result) };
      const facade = new McpDataMartSetupFacadeImpl(service as any, {} as any);
      expect(await facade[method](request as any)).toBe(result);
      expect(service[method]).toHaveBeenCalledWith(request);
      service[method].mockRejectedValue(new Error('read failed'));
      await expect(facade[method](request as any)).rejects.toThrow('read failed');
    }
  );
});
