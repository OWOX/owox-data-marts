import {
  isFinalPluginActionStatus,
  PluginActionExecutionStatus,
} from './plugin-action-execution-status.enum';

describe('isFinalPluginActionStatus', () => {
  it.each(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])('%s is final', status => {
    expect(isFinalPluginActionStatus(status)).toBe(true);
  });

  it.each(['RUNNING', 'QUEUED', 'anything'])('%s is not final', status => {
    expect(isFinalPluginActionStatus(status)).toBe(false);
  });

  it('has a QUEUED status, which is not final', () => {
    expect(PluginActionExecutionStatus.QUEUED).toBe('QUEUED');
    expect(isFinalPluginActionStatus(PluginActionExecutionStatus.QUEUED)).toBe(false);
  });
});
