import { OWOXApiError } from './errors.js';

export type OWOXProjectSettings = {
  description: string | null;
};

export type OWOXProjectSetupStepState = {
  done: boolean;
  completedAt: string | null;
};

export type OWOXProjectSetupProgressSteps = {
  hasStorage: OWOXProjectSetupStepState;
  hasDraftDataMart: OWOXProjectSetupStepState;
  hasPublishedDataMart: OWOXProjectSetupStepState;
  hasDestination: OWOXProjectSetupStepState;
  hasReport: OWOXProjectSetupStepState;
  hasReportRun: OWOXProjectSetupStepState;
  hasTeammatesInvited: OWOXProjectSetupStepState;
  hasGoogleSheetsDestination: OWOXProjectSetupStepState;
  hasGoogleSheetsExtension: OWOXProjectSetupStepState;
  hasGoogleSheetsReportRun: OWOXProjectSetupStepState;
};

export type OWOXProjectSetupProgress = {
  version: number;
  stepsSchemaVersion: number;
  progress: number;
  steps: OWOXProjectSetupProgressSteps;
};

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

type ProjectRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  putJson<T>(path: string, jsonBody: unknown): Promise<T>;
};

const PROJECT_SETUP_STEP_KEYS = [
  'hasStorage',
  'hasDraftDataMart',
  'hasPublishedDataMart',
  'hasDestination',
  'hasReport',
  'hasReportRun',
  'hasTeammatesInvited',
  'hasGoogleSheetsDestination',
  'hasGoogleSheetsExtension',
  'hasGoogleSheetsReportRun',
] as const;

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

function isProjectSetupStepState(value: unknown): value is OWOXProjectSetupStepState {
  return (
    isRecord(value) &&
    typeof value.done === 'boolean' &&
    (typeof value.completedAt === 'string' || value.completedAt === null)
  );
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

function parseProjectSettings(response: unknown): OWOXProjectSettings {
  if (
    !isRecord(response) ||
    !('description' in response) ||
    (typeof response.description !== 'string' && response.description !== null)
  ) {
    throw new OWOXApiError('OWOX Project Settings API returned an unexpected response shape', {
      details: response,
    });
  }

  return { description: response.description };
}

function parseProjectSetupProgress(response: unknown): OWOXProjectSetupProgress {
  if (
    !isRecord(response) ||
    typeof response.version !== 'number' ||
    !Number.isInteger(response.version) ||
    response.version < 1 ||
    typeof response.stepsSchemaVersion !== 'number' ||
    !Number.isInteger(response.stepsSchemaVersion) ||
    response.stepsSchemaVersion < 1 ||
    typeof response.progress !== 'number' ||
    !Number.isInteger(response.progress) ||
    response.progress < 0 ||
    response.progress > 100 ||
    !isRecord(response.steps)
  ) {
    throw new OWOXApiError(
      'OWOX Project Setup Progress API returned an unexpected response shape',
      { details: response }
    );
  }

  const steps = response.steps;
  if (
    !PROJECT_SETUP_STEP_KEYS.every(key => isProjectSetupStepState(steps[key])) ||
    !Object.values(steps).every(isProjectSetupStepState)
  ) {
    throw new OWOXApiError(
      'OWOX Project Setup Progress API returned an unexpected response shape',
      { details: response }
    );
  }

  return response as OWOXProjectSetupProgress;
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

export class ProjectApi {
  constructor(private readonly requester: ProjectRequester) {}

  async getSettings(): Promise<OWOXProjectSettings> {
    return parseProjectSettings(await this.requester.getJson<unknown>('/api/projects/settings'));
  }

  async getSetupProgress(): Promise<OWOXProjectSetupProgress> {
    return parseProjectSetupProgress(
      await this.requester.getJson<unknown>('/api/project-setup-progress')
    );
  }

  async getRunHistory(
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

  async updateDescription(description: string | null): Promise<OWOXProjectSettings> {
    return parseProjectSettings(
      await this.requester.putJson<unknown>('/api/projects/settings/description', { description })
    );
  }
}
