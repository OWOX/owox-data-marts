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

export type OWOXProjectDataMartRun = OWOXDataMartRun & {
  dataMart: OWOXProjectDataMartRunRef;
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
  if (
    !isRecord(options) ||
    Object.keys(options).some(key => key !== 'runType' && key !== 'data') ||
    (options.runType !== undefined &&
      options.runType !== 'INCREMENTAL' &&
      options.runType !== 'MANUAL_BACKFILL') ||
    (options.data !== undefined && !isRecord(options.data))
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

function validateRunListOptions(options: unknown): asserts options is OWOXDataMartRunListOptions {
  if (
    !isRecord(options) ||
    Object.keys(options).some(key => key !== 'limit' && key !== 'offset') ||
    (options.limit !== undefined && typeof options.limit !== 'number') ||
    (options.offset !== undefined && typeof options.offset !== 'number')
  ) {
    throw new OWOXApiError('Invalid OWOX Data Mart run-list options', { details: options });
  }
}

function isProjectDataMartRun(value: unknown): value is OWOXProjectDataMartRun {
  const projectRun = value as Record<string, unknown>;
  if (!isDataMartRun(value) || !isRecord(projectRun.dataMart)) {
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

  async start(
    dataMartId: string,
    options: OWOXDataMartRunStartOptions = {}
  ): Promise<OWOXRunDataMartResponse> {
    validateRunStartOptions(options);
    const response = await this.requester.postJson<unknown>(
      `/api/data-marts/${encodeURIComponent(dataMartId)}/manual-run`,
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

  async listForDataMart(
    dataMartId: string,
    options: OWOXDataMartRunListOptions = {}
  ): Promise<OWOXDataMartRunsResponse> {
    validateRunListOptions(options);
    const query = {
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      ...(options.offset === undefined ? {} : { offset: String(options.offset) }),
    };
    const response = await this.requester.getJson<unknown>(
      `/api/data-marts/${encodeURIComponent(dataMartId)}/runs`,
      Object.keys(query).length === 0 ? undefined : query
    );
    if (
      !isRecord(response) ||
      !Array.isArray(response.runs) ||
      !response.runs.every(isDataMartRun)
    ) {
      throw new OWOXApiError('OWOX Data Mart Runs API returned an unexpected response shape', {
        details: response,
      });
    }
    return response as OWOXDataMartRunsResponse;
  }

  async get(dataMartId: string, runId: string): Promise<OWOXDataMartRunDetail> {
    const response = await this.requester.getJson<unknown>(
      `/api/data-marts/${encodeURIComponent(dataMartId)}/runs/${encodeURIComponent(runId)}`
    );
    if (!isDataMartRunDetail(response)) {
      throw new OWOXApiError('OWOX Data Mart Run API returned an unexpected response shape', {
        details: response,
      });
    }
    return response;
  }

  async cancel(dataMartId: string, runId: string): Promise<void> {
    await this.requester.postJson<void>(
      `/api/data-marts/${encodeURIComponent(dataMartId)}/runs/${encodeURIComponent(runId)}/cancel`,
      undefined
    );
  }
}
