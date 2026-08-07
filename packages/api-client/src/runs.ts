import { OWOXApiError } from './errors.js';
import { isRecord } from './validation.js';
import {
  isDataMartRun,
  isDataMartRunDetail,
  type OWOXDataMartRun,
  type OWOXDataMartRunDetail,
  type OWOXDataMartRunListOptions,
  type OWOXDataMartRunStartOptions,
  type OWOXDataMartRunsResponse,
  type OWOXDataMartRunStatus,
  type OWOXDataMartRunTriggerType,
  type OWOXDataMartRunType,
  type OWOXDataMartRunUser,
  type OWOXRunDataMartResponse,
} from './data-mart-runs.js';

export type OWOXProjectDataMartRunStatus = OWOXDataMartRunStatus;
export type OWOXProjectDataMartRunType = OWOXDataMartRunType;
export type OWOXProjectDataMartRunTriggerType = OWOXDataMartRunTriggerType;

export type OWOXProjectDataMartRunRef = {
  /** Data Mart identifier. */
  id: string;
  /** Current Data Mart title. */
  title: string;
};

/** The author attributable to a run. */
export type OWOXProjectDataMartRunUser = OWOXDataMartRunUser;

export type OWOXProjectDataMartRun = Omit<OWOXDataMartRun, 'qualitySummary'> & {
  dataMart: OWOXProjectDataMartRunRef;
  /** Absent on older compatible deployments. */
  qualitySummary?: OWOXDataMartRun['qualitySummary'];
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
  postJson<T>(path: string, jsonBody: unknown, accept?: string): Promise<T>;
};

const MAX_MANUAL_RUN_PAYLOAD_BYTES = 1024 * 1024;

function validateRunStartOptions(options: unknown): asserts options is OWOXDataMartRunStartOptions {
  if (!isRecord(options)) {
    throw new OWOXApiError('Invalid OWOX Data Mart run-start options', { details: options });
  }
  const hasValidRunConfiguration =
    options.runType === 'MANUAL_BACKFILL'
      ? options.data === undefined || isRecord(options.data)
      : (options.runType === undefined || options.runType === 'INCREMENTAL') &&
        options.data === undefined;
  if (
    Object.keys(options).some(key => key !== 'runType' && key !== 'data') ||
    !hasValidRunConfiguration
  ) {
    throw new OWOXApiError('Invalid OWOX Data Mart run-start options', { details: options });
  }

  if (Object.keys(options).length > 0) {
    let json: string;
    try {
      json = JSON.stringify(options);
    } catch (error) {
      throw new OWOXApiError('Invalid OWOX Data Mart run-start options', {
        details: options,
        cause: error,
      });
    }
    if (new TextEncoder().encode(json).byteLength > MAX_MANUAL_RUN_PAYLOAD_BYTES) {
      throw new OWOXApiError('OWOX Data Mart manual-run payload exceeds 1MB', {
        details: { maxSizeBytes: MAX_MANUAL_RUN_PAYLOAD_BYTES },
      });
    }
  }
}

function validatePathId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim() === '.' ||
    value.trim() === '..' ||
    /[\\/%]/.test(value)
  ) {
    throw new OWOXApiError(`Invalid OWOX ${label} ID`, { details: value });
  }
}

function validateRunListOptions(options: unknown): asserts options is OWOXDataMartRunListOptions {
  if (
    !isRecord(options) ||
    Object.keys(options).some(key => key !== 'limit' && key !== 'offset') ||
    (options.limit !== undefined &&
      (!Number.isSafeInteger(options.limit) || (options.limit as number) <= 0)) ||
    (options.offset !== undefined &&
      (!Number.isSafeInteger(options.offset) || (options.offset as number) < 0))
  ) {
    throw new OWOXApiError('Invalid OWOX Data Mart run-list options', { details: options });
  }
}

function isProjectDataMartRun(value: unknown): value is OWOXProjectDataMartRun {
  if (!isRecord(value)) return false;
  const projectRun = value;
  const sharedRun =
    projectRun.qualitySummary === undefined ? { ...projectRun, qualitySummary: null } : projectRun;
  if (!isDataMartRun(sharedRun) || !isRecord(projectRun.dataMart)) {
    return false;
  }

  return (
    typeof projectRun.dataMart.id === 'string' && typeof projectRun.dataMart.title === 'string'
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

function normalizeDataMartRun(value: unknown): unknown {
  return isRecord(value) && value.qualitySummary === undefined
    ? { ...value, qualitySummary: null }
    : value;
}

function normalizeDataMartRunDetail(value: unknown): unknown {
  const run = normalizeDataMartRun(value);
  return isRecord(run) && run.dataQuality === undefined ? { ...run, dataQuality: null } : run;
}

export type OWOXDataMartRunsScope = {
  start(options?: OWOXDataMartRunStartOptions): Promise<OWOXRunDataMartResponse>;
  list(options?: OWOXDataMartRunListOptions): Promise<OWOXDataMartRunsResponse>;
  get(runId: string): Promise<OWOXDataMartRunDetail>;
  cancel(runId: string): Promise<void>;
};

class DataMartRunsScope implements OWOXDataMartRunsScope {
  private readonly path: string;

  constructor(
    private readonly requester: RunsRequester,
    dataMartId: string
  ) {
    validatePathId(dataMartId, 'Data Mart');
    this.path = `/api/data-marts/${encodeURIComponent(dataMartId)}`;
  }

  async start(options: OWOXDataMartRunStartOptions = {}): Promise<OWOXRunDataMartResponse> {
    validateRunStartOptions(options);
    const response = await this.requester.postJson<unknown>(
      `${this.path}/manual-run`,
      Object.keys(options).length === 0 ? {} : { payload: options }
    );
    if (
      !isRecord(response) ||
      typeof response.runId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        response.runId
      )
    ) {
      throw new OWOXApiError(
        'OWOX Data Mart Manual Run API returned an unexpected response shape',
        { details: response }
      );
    }
    return response as OWOXRunDataMartResponse;
  }

  async list(options: OWOXDataMartRunListOptions = {}): Promise<OWOXDataMartRunsResponse> {
    validateRunListOptions(options);
    const query = {
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      ...(options.offset === undefined ? {} : { offset: String(options.offset) }),
    };
    const response = await this.requester.getJson<unknown>(
      `${this.path}/runs`,
      Object.keys(query).length === 0 ? undefined : query
    );
    const normalizedResponse =
      isRecord(response) && Array.isArray(response.runs)
        ? { ...response, runs: response.runs.map(normalizeDataMartRun) }
        : response;
    if (
      !isRecord(normalizedResponse) ||
      !Array.isArray(normalizedResponse.runs) ||
      !normalizedResponse.runs.every(isDataMartRun)
    ) {
      throw new OWOXApiError('OWOX Data Mart Runs API returned an unexpected response shape', {
        details: response,
      });
    }
    return normalizedResponse as OWOXDataMartRunsResponse;
  }

  async get(runId: string): Promise<OWOXDataMartRunDetail> {
    validatePathId(runId, 'run');
    const response = await this.requester.getJson<unknown>(
      `${this.path}/runs/${encodeURIComponent(runId)}`
    );
    const normalizedResponse = normalizeDataMartRunDetail(response);
    if (!isDataMartRunDetail(normalizedResponse)) {
      throw new OWOXApiError('OWOX Data Mart Run API returned an unexpected response shape', {
        details: response,
      });
    }
    return normalizedResponse;
  }

  async cancel(runId: string): Promise<void> {
    validatePathId(runId, 'run');
    await this.requester.postJson<void>(
      `${this.path}/runs/${encodeURIComponent(runId)}/cancel`,
      undefined
    );
  }
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

  forDataMart(dataMartId: string): OWOXDataMartRunsScope {
    return new DataMartRunsScope(this.requester, dataMartId);
  }
}
