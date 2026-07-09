export const MCP_PROJECT_ID_PATTERN = /^[a-f0-9]{32}$/;

export function isMcpProjectId(value: string): boolean {
  return MCP_PROJECT_ID_PATTERN.test(value);
}
