import { isFinalPluginActionStatus } from './plugin-action-execution-status.enum';

describe('isFinalPluginActionStatus', () => {
  it.each(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])('%s is final', status => {
    expect(isFinalPluginActionStatus(status)).toBe(true);
  });

  it.each(['RUNNING', 'QUEUED', 'anything'])('%s is not final', status => {
    expect(isFinalPluginActionStatus(status)).toBe(false);
  });
});
