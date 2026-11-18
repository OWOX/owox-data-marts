export enum DataMartRunType {
  CONNECTOR = 'CONNECTOR',
  GOOGLE_SHEETS_EXPORT = 'GOOGLE_SHEETS_EXPORT',
  LOOKER_STUDIO = 'LOOKER_STUDIO',
  EXCEL = 'EXCEL',
  EMAIL = 'EMAIL',
  SLACK = 'SLACK',
  MS_TEAMS = 'MS_TEAMS',
  GOOGLE_CHAT = 'GOOGLE_CHAT',
  INSIGHT = 'INSIGHT',
  INSIGHT_TEMPLATE = 'INSIGHT_TEMPLATE',
  AI_ASSISTANT = 'AI_ASSISTANT',
  HTTP_DATA = 'HTTP_DATA',
  MCP_QUERY = 'MCP_QUERY',
  DATA_QUALITY = 'DATA_QUALITY',
}

export const HTTP_DATA_RUN_SHAPE_TYPES = [DataMartRunType.HTTP_DATA, DataMartRunType.EXCEL];

/**
 * Run types persisted by DataMartRunService.recordHttpDataRun.
 *
 * Their params live under `additionalParams.httpData`, totals nested inside it, rather than at
 * the top level like a run the server executed. Anything reading a run's params has to know
 * which shape it is looking at — the type alone no longer answers that, now that an Excel run
 * is recorded by the same method as a plain HTTP read.
 */
export function usesHttpDataRunShape(type: DataMartRunType): boolean {
  return HTTP_DATA_RUN_SHAPE_TYPES.includes(type);
}
