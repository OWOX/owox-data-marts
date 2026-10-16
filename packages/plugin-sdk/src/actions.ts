import { PluginTransportError, type IframeRequester } from './iframe-transport.js';
import type { PluginRequestInput } from './protocol.js';

const ACTIONS_PATH = '/api/plugins/runtime/actions';
const EXECUTIONS_PATH = '/api/plugins/runtime/executions';
/** The backend holds a poll open for at most 20 s, inside the transport's 30 s timeout. */
const POLL_WAIT_SECONDS = '20';
/** OWOX and the host bridge keep copies, pinned by `test/contracts/plugin-action-contract.mjs`. */
export const FINAL_STATUSES: ReadonlySet<string> = new Set([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);

export type PluginActionStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';

export interface PluginActionExecution {
  readonly id: string;
  readonly action: string;
  readonly status: PluginActionStatus;
  readonly trigger: 'frontend';
  readonly startedAt: string | null;
  readonly deadlineAt: string | null;
  readonly finishedAt: string | null;
  /** Set when the execution SUCCEEDED; null again once OWOX clears results after 24 hours. */
  readonly result: unknown;
  readonly error: { readonly code: string; readonly message: string } | null;
}

export interface PluginActions {
  /** Runs an action and waits for its result. Aborting `signal`, or leaving the plugin page, cancels it. */
  invoke<T = unknown>(
    name: string,
    input?: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<T>;
  /** Starts an action that keeps running after the plugin closes. */
  start(name: string, input?: unknown): Promise<{ id: string }>;
  get(id: string): Promise<PluginActionExecution>;
  /** Waits for the result of a started action. Aborting `signal` cancels the execution. */
  wait<T = unknown>(id: string, options?: { signal?: AbortSignal }): Promise<T>;
  cancel(id: string): Promise<PluginActionExecution>;
}

/** Not exported as a value, like PluginTransportError: plugin code matches on `error.name`. */
export class PluginActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly executionId?: string,
    /** Which input fields failed, for an `INVALID_INPUT` refusal. */
    readonly errors?: readonly { instancePath: string; message: string }[]
  ) {
    super(message);
    this.name = 'PluginActionError';
  }
}

/** @internal Creates `ctx.actions` over the host-brokered transport. */
export function createPluginActions(requester: IframeRequester): PluginActions {
  async function request<T>(input: PluginRequestInput, signal?: AbortSignal): Promise<T> {
    const response = await requester.send(input, signal);
    if (!response.ok) throw new PluginTransportError(response.error);
    return ('body' in response ? response.body : undefined) as T;
  }

  const executionPath = (id: string) => `${EXECUTIONS_PATH}/${encodeURIComponent(id)}`;

  async function startExecution(
    name: string,
    input: unknown,
    cancelOnClose: boolean
  ): Promise<string> {
    const response = await requester.send({
      kind: 'api',
      method: 'POST',
      path: `${ACTIONS_PATH}/${encodeURIComponent(name)}/executions`,
      body: { input: input ?? null },
      ...(cancelOnClose ? { cancelOnClose: true as const } : {}),
    });
    if (!response.ok) {
      const { code, apiCode, status, message, details } = response.error;
      if (code === 'HTTP_ERROR' && apiCode) {
        throw new PluginActionError(apiCode, message, undefined, inputErrors(details));
      }
      // A body over the route limit is refused before the API can attach its code.
      if (code === 'HTTP_ERROR' && status === 413) {
        throw new PluginActionError('INPUT_TOO_LARGE', message);
      }
      throw new PluginTransportError(response.error);
    }
    const id = 'body' in response ? (response.body as { id?: unknown } | undefined)?.id : undefined;
    if (typeof id !== 'string') {
      throw new PluginTransportError({
        code: 'PROTOCOL_ERROR',
        message: 'The host answered a start without an execution id',
      });
    }
    return id;
  }

  const read = (id: string, waitSeconds: string, signal?: AbortSignal) =>
    request<PluginActionExecution>(
      {
        kind: 'api',
        method: 'GET',
        path: executionPath(id),
        query: [['waitSeconds', waitSeconds]],
      },
      signal
    );

  const cancel = (id: string) =>
    request<PluginActionExecution>({
      kind: 'api',
      method: 'POST',
      path: `${executionPath(id)}/cancel`,
    });

  async function waitForResult<T>(id: string, signal?: AbortSignal): Promise<T> {
    try {
      for (;;) {
        signal?.throwIfAborted();
        let execution: PluginActionExecution;
        try {
          execution = await read(id, POLL_WAIT_SECONDS, signal);
        } catch (error) {
          if (error instanceof PluginTransportError && error.payload.code === 'TIMEOUT') continue;
          throw error;
        }
        if (FINAL_STATUSES.has(execution.status)) return settle<T>(execution);
      }
    } catch (error) {
      if (signal?.aborted) {
        // Without the signal: an aborted cancel would leave the execution running.
        void cancel(id).catch(() => undefined);
        throw signal.reason;
      }
      throw error;
    }
  }

  return {
    invoke: async <T = unknown>(
      name: string,
      input?: unknown,
      options: { signal?: AbortSignal } = {}
    ) => {
      // The start gets no signal: an aborted start could leave an execution nobody cancels.
      options.signal?.throwIfAborted();
      return waitForResult<T>(await startExecution(name, input, true), options.signal);
    },
    start: async (name: string, input?: unknown) => ({
      id: await startExecution(name, input, false),
    }),
    get: (id: string) => read(id, '0'),
    wait: <T = unknown>(id: string, options: { signal?: AbortSignal } = {}) =>
      waitForResult<T>(id, options.signal),
    cancel,
  };
}

/** An `INVALID_INPUT` refusal carries the failed fields as `errorDetails.errors`. */
function inputErrors(details: unknown): PluginActionError['errors'] {
  const errors = (details as { errors?: unknown } | null | undefined)?.errors;
  return Array.isArray(errors) ? (errors as PluginActionError['errors']) : undefined;
}

function settle<T>(execution: PluginActionExecution): T {
  if (execution.status === 'SUCCEEDED') return execution.result as T;
  const code =
    execution.status === 'FAILED' ? (execution.error?.code ?? 'FAILED') : execution.status;
  throw new PluginActionError(
    code,
    execution.error?.message ?? `The action ended ${execution.status}`,
    execution.id
  );
}
