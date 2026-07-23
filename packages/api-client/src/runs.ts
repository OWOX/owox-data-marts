import { OWOXApiError } from './errors.js';

export type OWOXProjectDataMartRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'RESTRICTED';

export type OWOXProjectDataMartRunType =
  | 'CONNECTOR'
  | 'GOOGLE_SHEETS_EXPORT'
  | 'LOOKER_STUDIO'
  | 'EMAIL'
  | 'SLACK'
  | 'MS_TEAMS'
  | 'GOOGLE_CHAT'
  | 'INSIGHT'
  | 'INSIGHT_TEMPLATE'
  | 'AI_ASSISTANT'
  | 'HTTP_DATA'
  | 'MCP_QUERY';

export type OWOXProjectDataMartRunTriggerType = 'manual' | 'scheduled';

export type OWOXProjectDataMartRunRef = {
  id: string;
  title: string;
};

export type OWOXProjectDataMartRunUser = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type OWOXProjectDataMartRun = {
  id: string;
  status: OWOXProjectDataMartRunStatus;
  type: OWOXProjectDataMartRunType;
  runType: OWOXProjectDataMartRunTriggerType;
  dataMartId: string;
  dataMart: OWOXProjectDataMartRunRef;
  createdByUser: OWOXProjectDataMartRunUser | null;
  definitionRun?: Record<string, unknown> | null;
  reportId?: string | null;
  reportDefinition?: Record<string, unknown> | null;
  insightId?: string | null;
  insightDefinition?: Record<string, unknown> | null;
  insightTemplateId?: string | null;
  insightTemplateDefinition?: Record<string, unknown> | null;
  aiSourceDefinition?: Record<string, unknown> | null;
  logs?: string[] | null;
  errors?: string[] | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  additionalParams?: Record<string, unknown> | null;
  totals?: Record<string, number | string | boolean | null> | null;
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

const PROJECT_DATA_MART_RUN_STATUSES = new Set<OWOXProjectDataMartRunStatus>([
  'PENDING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
  'RESTRICTED',
]);

const PROJECT_DATA_MART_RUN_TYPES = new Set<OWOXProjectDataMartRunType>([
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
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalNullableRecord(value: unknown): boolean {
  return value === undefined || value === null || isRecord(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.every(item => typeof item === 'string'))
  );
}

function isNullableProjectDataMartRunUser(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.userId === 'string' &&
      isOptionalNullableString(value.fullName) &&
      isOptionalNullableString(value.email) &&
      isOptionalNullableString(value.avatar))
  );
}

function isOptionalTotals(value: unknown): boolean {
  return (
    value === undefined ||
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
    PROJECT_DATA_MART_RUN_STATUSES.has(value.status as OWOXProjectDataMartRunStatus) &&
    typeof value.type === 'string' &&
    PROJECT_DATA_MART_RUN_TYPES.has(value.type as OWOXProjectDataMartRunType) &&
    (value.runType === 'manual' || value.runType === 'scheduled') &&
    typeof value.dataMartId === 'string' &&
    typeof value.dataMart.id === 'string' &&
    typeof value.dataMart.title === 'string' &&
    isNullableProjectDataMartRunUser(value.createdByUser) &&
    isOptionalNullableRecord(value.definitionRun) &&
    isOptionalNullableString(value.reportId) &&
    isOptionalNullableRecord(value.reportDefinition) &&
    isOptionalNullableString(value.insightId) &&
    isOptionalNullableRecord(value.insightDefinition) &&
    isOptionalNullableString(value.insightTemplateId) &&
    isOptionalNullableRecord(value.insightTemplateDefinition) &&
    isOptionalNullableRecord(value.aiSourceDefinition) &&
    isOptionalNullableStringArray(value.logs) &&
    isOptionalNullableStringArray(value.errors) &&
    typeof value.createdAt === 'string' &&
    isOptionalNullableString(value.startedAt) &&
    isOptionalNullableString(value.finishedAt) &&
    isOptionalNullableRecord(value.additionalParams) &&
    isOptionalTotals(value.totals)
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

  async getHistory(
    options: OWOXProjectRunHistoryOptions = {}
  ): Promise<OWOXProjectDataMartRunsResponse> {
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
