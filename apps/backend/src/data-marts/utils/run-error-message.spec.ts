import { extractRunErrorMessage } from './run-error-message';

describe('extractRunErrorMessage', () => {
  it.each([
    [JSON.stringify({ error: 'storage read failed' }), 'storage read failed'],
    [JSON.stringify({ message: 'worker failed' }), 'worker failed'],
    [JSON.stringify({ msg: 'delivery failed' }), 'delivery failed'],
    ['plain trigger failure', 'plain trigger failure'],
    [JSON.stringify({ detail: 'not supported' }), JSON.stringify({ detail: 'not supported' })],
  ])('extracts a readable run error from %s', (entry, expected) => {
    expect(extractRunErrorMessage(entry)).toBe(expected);
  });

  // A failed run's errors array also holds classified warnings, which carry their text
  // under `warning`. These entries reach customers through failure emails and MCP report
  // status, so falling through to the raw JSON leaks an escaped blob and a stack trace.
  it('reads a persisted connector warning entry', () => {
    const entry = JSON.stringify({
      type: 'addWarningToCurrentStatus',
      at: '2026-07-27T14:16:21.365Z',
      warning:
        'HttpRequestException: Error validating access token: Session has expired.\n    at FacebookMarketingSource._validateResponse (/app/index.cjs:436:11)',
    });

    const extracted = extractRunErrorMessage(entry);

    expect(extracted).toContain('Session has expired');
    expect(extracted).not.toContain('addWarningToCurrentStatus');
    expect(extracted.slice(0, 300)).not.toContain('{"type"');
  });

  it('reads a warning raised for a cancelled configuration', () => {
    const entry = JSON.stringify({
      type: 'addWarningToCurrentStatus',
      at: '2026-07-27T14:16:21.365Z',
      warning: 'Connector process was aborted',
    });

    expect(extractRunErrorMessage(entry)).toBe('Connector process was aborted');
  });
});
