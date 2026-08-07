import { OWOXApiError } from './errors.js';
import { isRecord } from './validation.js';
import {
  isDataMartRun,
  type OWOXDataMartRun,
  type OWOXDataMartRunStatus,
  type OWOXDataMartRunTriggerType,
  type OWOXDataMartRunType,
  type OWOXDataMartRunUser,
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
};

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
}
