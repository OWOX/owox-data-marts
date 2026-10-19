jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { McpDataMartExecutionFacadeImpl } from './mcp-data-mart-execution.facade.impl';
describe('McpDataMartExecutionFacadeImpl', () => {
  it.each([
    'getRun',
    'listSchedules',
    'cancelRun',
    'runDataMart',
    'saveSchedule',
    'deleteSchedule',
  ] as const)('delegates %s and propagates failure', async method => {
    const request = {
      projectId: 'project',
      userId: 'user',
      roles: ['editor'],
      dataMartId: 'dm',
      runId: 'run',
      expectedRevision: 1,
      operationId: 'operation',
      scheduleId: 'schedule',
      cronExpression: '0 9 * * *',
      timeZone: 'UTC',
      enabled: true,
    };
    const result = { actual: 'domain-result' };
    const execution = { [method]: jest.fn().mockResolvedValue(result) };
    const facade = new McpDataMartExecutionFacadeImpl(execution as any);
    expect(await facade[method](request)).toBe(result);
    expect(execution[method]).toHaveBeenCalledWith(request);
    execution[method].mockRejectedValue(new Error('domain-failure'));
    await expect(facade[method](request)).rejects.toThrow('domain-failure');
  });
});
