import { toRefusal, type PluginActionStatus } from './actions.js';
import { PluginTransportError, type IframeRequester } from './iframe-transport.js';
import type { PluginRequestInput } from './protocol.js';

const SCHEDULES_PATH = '/api/plugins/runtime/schedules';

export interface PluginSchedule {
  readonly id: string;
  readonly name: string | null;
  readonly action: string;
  readonly parameters: unknown;
  readonly cron: string;
  readonly timeZone: string;
  readonly enabled: boolean;
  readonly disabledReason: 'ACTION_NOT_DECLARED' | 'INVALID_PARAMETERS' | 'PAUSED_BY_ADMIN' | null;
  readonly nextRunAt: string | null;
  readonly lastRun: {
    readonly executionId: string;
    readonly status: PluginActionStatus;
    readonly errorCode: string | null;
    readonly finishedAt: string | null;
  } | null;
  readonly createdAt: string;
  readonly modifiedAt: string;
}

export interface PluginScheduleReader {
  list(): Promise<PluginSchedule[]>;
  get(id: string): Promise<PluginSchedule>;
}

export interface PluginSchedules extends PluginScheduleReader {
  create(schedule: {
    action: string;
    parameters?: unknown;
    cron: string;
    timeZone: string;
    enabled?: boolean;
    name?: string;
  }): Promise<PluginSchedule>;
  update(
    id: string,
    patch: {
      action?: string;
      parameters?: unknown;
      cron?: string;
      timeZone?: string;
      name?: string | null;
    }
  ): Promise<PluginSchedule>;
  pause(id: string): Promise<PluginSchedule>;
  resume(id: string): Promise<PluginSchedule>;
  delete(id: string): Promise<void>;
}

/** `bare413Code` names a 413 the API did not answer itself; only a call that carries parameters has one. */
async function call<T>(
  requester: IframeRequester,
  input: PluginRequestInput,
  bare413Code?: string
): Promise<T> {
  const response = await requester.send(input);
  if (!response.ok) throw toRefusal(response.error, bare413Code);
  return ('body' in response ? response.body : undefined) as T;
}

/** A call that answers one schedule, so the answer must at least name it. */
async function callSchedule(
  requester: IframeRequester,
  input: PluginRequestInput,
  bare413Code?: string
): Promise<PluginSchedule> {
  const body = await call<{ id?: unknown } | undefined>(requester, input, bare413Code);
  if (typeof body?.id !== 'string') {
    throw new PluginTransportError({
      code: 'PROTOCOL_ERROR',
      message: 'The host answered a schedule without an id',
    });
  }
  return body as PluginSchedule;
}

const schedulePath = (id: string) => `${SCHEDULES_PATH}/${encodeURIComponent(id)}`;

/** @internal Creates the read half of `ctx.schedules`, the only half a backend action gets. */
export function createPluginScheduleReader(requester: IframeRequester): PluginScheduleReader {
  return {
    async list() {
      const body = await call<{ schedules?: unknown }>(requester, {
        kind: 'api',
        method: 'GET',
        path: SCHEDULES_PATH,
      });
      if (!Array.isArray(body?.schedules)) {
        throw new PluginTransportError({
          code: 'PROTOCOL_ERROR',
          message: 'The host answered a schedule list without schedules',
        });
      }
      return body.schedules as PluginSchedule[];
    },
    get: id => callSchedule(requester, { kind: 'api', method: 'GET', path: schedulePath(id) }),
  };
}

/** @internal Creates `ctx.schedules` over the host-brokered transport. */
export function createPluginSchedules(requester: IframeRequester): PluginSchedules {
  return {
    ...createPluginScheduleReader(requester),
    create: schedule =>
      callSchedule(
        requester,
        { kind: 'api', method: 'POST', path: SCHEDULES_PATH, body: schedule },
        'PARAMETERS_TOO_LARGE'
      ),
    update: (id, patch) =>
      callSchedule(
        requester,
        { kind: 'api', method: 'PATCH', path: schedulePath(id), body: patch },
        'PARAMETERS_TOO_LARGE'
      ),
    pause: id =>
      callSchedule(requester, {
        kind: 'api',
        method: 'POST',
        path: `${schedulePath(id)}/pause`,
      }),
    resume: id =>
      callSchedule(requester, {
        kind: 'api',
        method: 'POST',
        path: `${schedulePath(id)}/resume`,
      }),
    delete: async id => {
      await call<void>(requester, { kind: 'api', method: 'DELETE', path: schedulePath(id) });
    },
  };
}
