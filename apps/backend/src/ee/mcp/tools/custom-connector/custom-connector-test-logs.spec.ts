import {
  boundTestLogsForMcp,
  MCP_TEST_LOG_MAX_ENTRIES,
  MCP_TEST_LOG_MAX_ENTRY_CHARS,
  MCP_TEST_LOG_MAX_TOTAL_CHARS,
} from './custom-connector-test-logs';

describe('boundTestLogsForMcp', () => {
  it('preserves ordinary logs and empty results', () => {
    expect(boundTestLogsForMcp([])).toEqual([]);
    const logs = Object.freeze(['GET /items', 'Fetched 1 row']);
    expect(boundTestLogsForMcp(logs)).toEqual(logs);
  });

  it('keeps the newest entries in chronological order and reports omitted entries', () => {
    const logs = Object.freeze(Array.from({ length: 75 }, (_, i) => `line ${i}`));
    const bounded = boundTestLogsForMcp(logs);
    expect(bounded).toEqual([
      '… 25 earlier log line(s) omitted',
      ...logs.slice(-MCP_TEST_LOG_MAX_ENTRIES),
    ]);
  });

  it('caps a verbose final error without losing the surrounding trail', () => {
    const logs = ['Started', `Failed: ${'x'.repeat(5000)}`];
    const bounded = boundTestLogsForMcp(logs);
    expect(bounded[0]).toBe('Started');
    expect(bounded[1]).toHaveLength(MCP_TEST_LOG_MAX_ENTRY_CHARS);
    expect(bounded[1]).toMatch(/^Failed: .*… \[truncated\]$/);
    expect(logs[1]).toHaveLength(5008);
  });

  it('includes the omission notice within the total budget and retains the final verdict', () => {
    const logs = [...Array.from({ length: 10 }, () => 'x'.repeat(1800)), 'Invalid recordPath'];
    const bounded = boundTestLogsForMcp(logs);
    expect(bounded[0]).toBe('… 6 earlier log line(s) omitted');
    expect(bounded.at(-1)).toBe('Invalid recordPath');
    expect(bounded.join('').length).toBeLessThanOrEqual(MCP_TEST_LOG_MAX_TOTAL_CHARS);
  });

  it('keeps astral characters intact at a truncation boundary', () => {
    const [line] = boundTestLogsForMcp(['😀'.repeat(1500)]);
    expect(line.length).toBeLessThanOrEqual(MCP_TEST_LOG_MAX_ENTRY_CHARS);
    expect(line.endsWith('… [truncated]')).toBe(true);
    expect(Buffer.from(line, 'utf8').toString('utf8')).toBe(line);
    expect(line.slice(0, -'… [truncated]'.length)).toMatch(/^(😀)+$/u);
  });

  it('does not truncate a complete trail that exactly fits the budget', () => {
    const logs = Array.from({ length: 4 }, () => 'x'.repeat(MCP_TEST_LOG_MAX_ENTRY_CHARS));
    expect(logs.join('')).toHaveLength(MCP_TEST_LOG_MAX_TOTAL_CHARS);
    expect(boundTestLogsForMcp(logs)).toEqual(logs);
  });
});
