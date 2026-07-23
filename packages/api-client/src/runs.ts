import { OWOXApiError } from './errors.js';
import { isRecord, isRfc3339DateTimeString, isUserProjection } from './validation.js';

const PROJECT_DATA_MART_RUN_STATUS_VALUES = [
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
  'RESTRICTED',
] as const;

export type OWOXProjectDataMartRunStatus = (typeof PROJECT_DATA_MART_RUN_STATUS_VALUES)[number];

const PROJECT_DATA_MART_RUN_TYPE_VALUES = [
  'CONNECTOR',
  'GOOGLE_SHEETS_EXPORT',
  'LOOKER_STUDIO',
  'EMAIL',
  'SLACK',
  'MS_TEAMS',
  'GOOGLE_CHAT',
  'INSIGHT',
  'INSIGHT_TEMPLATE',
  'AI_ASSISTANT',
  'HTTP_DATA',
  'MCP_QUERY',
] as const;

export type OWOXProjectDataMartRunType = (typeof PROJECT_DATA_MART_RUN_TYPE_VALUES)[number];

const PROJECT_DATA_MART_RUN_TRIGGER_VALUES = ['manual', 'scheduled'] as const;

export type OWOXProjectDataMartRunTriggerType =
  (typeof PROJECT_DATA_MART_RUN_TRIGGER_VALUES)[number];

export type OWOXProjectDataMartRunRef = {
  /** Data Mart identifier. */
  id: string;
  /** Current Data Mart title. */
  title: string;
};

/** The author attributable to a run. */
export type OWOXProjectDataMartRunUser = {
  /** Run author user identifier. */
  userId: string;
  /** Run author full name when available. */
  fullName?: string | null;
  /** Run author email address when available. */
  email?: string | null;
  /** Run author avatar URL when available. */
  avatar?: string | null;
};

export type OWOXProjectDataMartRun = {
  id: string;
  status: OWOXProjectDataMartRunStatus;
  type: OWOXProjectDataMartRunType;
  runType: OWOXProjectDataMartRunTriggerType;
  dataMartId: string;
  dataMart: OWOXProjectDataMartRunRef;
  /**
   * The run author. Null when the run has no creator ID or its user projection
   * is unavailable.
   */
  createdByUser: OWOXProjectDataMartRunUser | null;
  /** Masked definition snapshot, or null when unavailable for a historical run. */
  definitionRun: Record<string, unknown> | null;
  reportId: string | null;
  reportDefinition: Record<string, unknown> | null;
  insightId: string | null;
  insightDefinition: Record<string, unknown> | null;
  insightTemplateId: string | null;
  insightTemplateDefinition: Record<string, unknown> | null;
  aiSourceDefinition: Record<string, unknown> | null;
  logs: string[] | null;
  errors: string[] | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  additionalParams: Record<string, unknown> | null;
  totals: Record<string, number | string | boolean | null> | null;
};

export type OWOXProjectDataMartRunsResponse = {
  runs: OWOXProjectDataMartRun[];
};

export type OWOXProjectRunHistoryOptions = {
  limit?: number;
  offset?: number;
};

type RunsRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
};

const PROJECT_DATA_MART_RUN_STATUSES = new Set<string>(PROJECT_DATA_MART_RUN_STATUS_VALUES);
const PROJECT_DATA_MART_RUN_TYPES = new Set<string>(PROJECT_DATA_MART_RUN_TYPE_VALUES);
const PROJECT_DATA_MART_RUN_TRIGGERS = new Set<string>(PROJECT_DATA_MART_RUN_TRIGGER_VALUES);

function isNullableRecord(value: unknown): boolean {
  return value === null || isRecord(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNullableDateTimeString(value: unknown): boolean {
  return value === null || isRfc3339DateTimeString(value);
}

function isNullableStringArray(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

function isNullableProjectDataMartRunUser(value: unknown): boolean {
  return value === null || isUserProjection(value);
}

function isNullableTotals(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      Object.values(value).every(
        item =>
          item === null ||
          typeof item === 'number' ||
          typeof item === 'string' ||
          typeof item === 'boolean'
      ))
  );
}

function isProjectDataMartRun(value: unknown): value is OWOXProjectDataMartRun {
  if (!isRecord(value) || !isRecord(value.dataMart)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    PROJECT_DATA_MART_RUN_STATUSES.has(value.status) &&
    typeof value.type === 'string' &&
    PROJECT_DATA_MART_RUN_TYPES.has(value.type) &&
    typeof value.runType === 'string' &&
    PROJECT_DATA_MART_RUN_TRIGGERS.has(value.runType) &&
    typeof value.dataMartId === 'string' &&
    typeof value.dataMart.id === 'string' &&
    typeof value.dataMart.title === 'string' &&
    isNullableProjectDataMartRunUser(value.createdByUser) &&
    isNullableRecord(value.definitionRun) &&
    isNullableString(value.reportId) &&
    isNullableRecord(value.reportDefinition) &&
    isNullableString(value.insightId) &&
    isNullableRecord(value.insightDefinition) &&
    isNullableString(value.insightTemplateId) &&
    isNullableRecord(value.insightTemplateDefinition) &&
    isNullableRecord(value.aiSourceDefinition) &&
    isNullableStringArray(value.logs) &&
    isNullableStringArray(value.errors) &&
    isRfc3339DateTimeString(value.createdAt) &&
    isNullableDateTimeString(value.startedAt) &&
    isNullableDateTimeString(value.finishedAt) &&
    isNullableRecord(value.additionalParams) &&
    isNullableTotals(value.totals)
  );
}

function parseProjectRunHistory(response: unknown): OWOXProjectDataMartRunsResponse {
  if (
    !isRecord(response) ||
    !Array.isArray(response.runs) ||
    !response.runs.every(isProjectDataMartRun)
  ) {
    throw new OWOXApiError('OWOX Project Run History API returned an unexpected response shape', {
      details: response,
    });
  }

  return response as OWOXProjectDataMartRunsResponse;
}

export class RunsApi {
  constructor(private readonly requester: RunsRequester) {}

  async list(options: OWOXProjectRunHistoryOptions = {}): Promise<OWOXProjectDataMartRunsResponse> {
    const query = {
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      ...(options.offset === undefined ? {} : { offset: String(options.offset) }),
    };

    return parseProjectRunHistory(
      await this.requester.getJson<unknown>(
        '/api/data-marts/runs',
        Object.keys(query).length === 0 ? undefined : query
      )
    );
  }
}
