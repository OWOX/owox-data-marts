export const MCP_TEST_LOG_MAX_ENTRIES = 50;
export const MCP_TEST_LOG_MAX_ENTRY_CHARS = 2000;
export const MCP_TEST_LOG_MAX_TOTAL_CHARS = 8000;

const TRUNCATED = '… [truncated]';
const omissionNotice = (count: number) => `… ${count} earlier log line(s) omitted`;

export function boundTestLogsForMcp(logs: readonly string[]): string[] {
  if (
    logs.length <= MCP_TEST_LOG_MAX_ENTRIES &&
    logs.every(line => line.length <= MCP_TEST_LOG_MAX_ENTRY_CHARS) &&
    logs.reduce((total, line) => total + line.length, 0) <= MCP_TEST_LOG_MAX_TOTAL_CHARS
  ) {
    return [...logs];
  }

  const kept: string[] = [];
  let remaining = MCP_TEST_LOG_MAX_TOTAL_CHARS - omissionNotice(logs.length).length;
  // Must stay in sync with ConnectorTestService: final diagnostics must remain at the end.
  for (let i = logs.length - 1; i >= 0 && kept.length < MCP_TEST_LOG_MAX_ENTRIES; i--) {
    const line = logs[i];
    let entry = line;
    if (line.length > MCP_TEST_LOG_MAX_ENTRY_CHARS) {
      let end = MCP_TEST_LOG_MAX_ENTRY_CHARS - TRUNCATED.length;
      if ((line.codePointAt(end - 1) ?? 0) > 0xffff) end--;
      entry = `${line.slice(0, end)}${TRUNCATED}`;
    }
    if (entry.length > remaining) break;
    remaining -= entry.length;
    kept.push(entry);
  }
  kept.reverse();
  const dropped = logs.length - kept.length;
  return dropped > 0 ? [omissionNotice(dropped), ...kept] : kept;
}
