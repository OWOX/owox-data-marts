import { OWOXApiClient } from '@owox/api-client';
import {
  ERROR_CODE_PATTERN,
  OWOX_ERROR_CODES,
  RESERVED_ERROR_CODE_PREFIX,
} from '../action-codes.js';
import { createPluginCollection, type PluginCollection } from '../collections.js';
import {
  createPluginCredentials,
  type PluginCredentialHandleDescriptor,
  type PluginCredentials,
} from '../credentials.js';
import { createIframeTransport } from '../iframe-transport.js';
import { createServerRequester, GUARDED_FETCH } from './requester.js';

export { exactCredential } from '../credentials.js';
export type { CredentialHandle, PluginCredentials } from '../credentials.js';
export type { PluginCollection } from '../collections.js';

const CURRENT_EXECUTION_PATH = '/api/plugins/runtime/executions/current';
const MAX_ERROR_MESSAGE_CHARS = 1000;
const REPOSITORY_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const LOCAL_NAME_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export interface PluginActionExecutionContext {
  readonly executionId: string;
  readonly action: string;
  readonly input: unknown;
  readonly trigger: 'frontend';
  readonly deadlineAt: string;
  readonly pluginVersion: string;
  readonly installationId: string;
  readonly projectId: string;
  readonly userId: string;
  /** The plugin as OWOX knows it; `repositoryId` is its GitHub repository id. */
  readonly plugin: { readonly id: string; readonly repositoryId: string };
}

export interface BackendActionContext {
  /** Acts with the access of the member who installed the plugin, until the deadline. */
  readonly owox: OWOXApiClient;
  /** Exact Credential handles; the secret stays in OWOX. */
  readonly credentials: PluginCredentials;
  collections<T>(name: string): PluginCollection<T>;
  readonly execution: PluginActionExecutionContext;
  /** The OWOX origin that accepted the execution token; build links to OWOX pages from it. */
  readonly host: string;
  /** Aborts at the action's deadline. */
  readonly signal: AbortSignal;
}

export type BackendActionHandler = (input: unknown, ctx: BackendActionContext) => unknown;

interface WorkerContext extends PluginActionExecutionContext {
  readonly credentialHandles?: readonly PluginCredentialHandleDescriptor[];
}

/** Builds a Fetch API handler, such as a Worker module, that runs a plugin's backend actions. */
export function createBackend(options: {
  /** The plugin's GitHub repository id; executions of any other plugin are refused. */
  repositoryId: string;
  hosts?: readonly string[];
  actions: Readonly<Record<string, BackendActionHandler>>;
}): { fetch(request: Request): Promise<Response> } {
  if (
    typeof options.repositoryId !== 'string' ||
    !REPOSITORY_ID_PATTERN.test(options.repositoryId)
  ) {
    throw new TypeError(
      "createBackend: repositoryId must be the plugin's GitHub repository id, as printed by gh api repos/OWNER/NAME --jq .id"
    );
  }
  if (
    options.hosts !== undefined &&
    (options.hosts.length === 0 || !options.hosts.every(isExactOrigin))
  ) {
    throw new TypeError(
      'createBackend: hosts must list exact origins without wildcards, such as https://app.owox.com'
    );
  }
  // Without a list any public deployment may call: everything ctx reaches goes back to that host.
  const hosts = options.hosts ? new Set(options.hosts) : null;
  // Set only by server/node, which checks the addresses it connects to.
  const guardedFetch = (options as { [GUARDED_FETCH]?: typeof fetch })[GUARDED_FETCH];
  // Deployed Workers refuse private, loopback and IP-literal destinations (Cloudflare errors 1002,
  // 1003, 1016) and reach private networks only through VPC bindings, so the name check is enough
  // there. `wrangler dev` does reach private addresses; the docs say to list hosts locally.
  if (!hosts && !guardedFetch && globalThis.navigator?.userAgent !== 'Cloudflare-Workers') {
    throw new TypeError(
      'createBackend: on this runtime list hosts, or import createBackend from @owox/plugin-sdk/server/node, which checks the addresses it connects to'
    );
  }

  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== 'POST') {
        return failure(405, 'METHOD_NOT_ALLOWED', 'OWOX calls actions with POST');
      }
      const token = request.headers.get('x-owox-execution-token');
      const call = (await request.json().catch(() => null)) as {
        owox?: unknown;
        host?: unknown;
        executionId?: unknown;
      } | null;
      if (
        !token ||
        call?.owox !== 1 ||
        typeof call.host !== 'string' ||
        !isExactOrigin(call.host) ||
        typeof call.executionId !== 'string'
      ) {
        return failure(400, 'BAD_REQUEST', 'This is not an OWOX action request');
      }
      if (hosts && !hosts.has(call.host)) {
        return failure(403, 'HOST_NOT_ALLOWED', `${call.host} is not one of this backend's hosts`);
      }
      if (!hosts && !isPublicHttpsOrigin(call.host)) {
        return failure(
          403,
          'HOST_NOT_ALLOWED',
          `${call.host} is not a public HTTPS origin; list internal deployments in hosts`
        );
      }

      // The token proves nothing until the host it names accepts it.
      const requester = createServerRequester({ host: call.host, token, fetch: guardedFetch });
      const current = await requester.send({
        kind: 'api',
        method: 'GET',
        path: CURRENT_EXECUTION_PATH,
      });
      if (!current.ok) {
        // The path is fixed, so FORBIDDEN can only be server/node refusing the host's address.
        if (current.error.code === 'FORBIDDEN') {
          return failure(
            403,
            'HOST_NOT_ALLOWED',
            `${call.host} resolves to a private address; list internal deployments in hosts`
          );
        }
        // A 403 is OWOX refusing to build the context, such as an unusable required Credential.
        return current.error.status === 401
          ? failure(401, 'UNAUTHORIZED', 'OWOX did not accept the execution token')
          : failure(502, 'EXECUTION_CONTEXT_UNAVAILABLE', current.error.message);
      }
      const context = ('body' in current ? current.body : null) as WorkerContext | null;
      if (!context || context.executionId !== call.executionId) {
        return failure(401, 'UNAUTHORIZED', 'The execution does not match this request');
      }
      // Another plugin on the same deployment could forward its own token with a matching action.
      if (context.plugin?.repositoryId !== options.repositoryId) {
        return failure(403, 'PLUGIN_MISMATCH', 'This execution belongs to another plugin');
      }
      if (typeof context.action !== 'string') {
        return failure(502, 'EXECUTION_CONTEXT_UNAVAILABLE', 'OWOX sent no action name');
      }
      const handler = Object.hasOwn(options.actions, context.action)
        ? options.actions[context.action]
        : undefined;
      if (typeof handler !== 'function') {
        return failure(
          404,
          'ACTION_NOT_IMPLEMENTED',
          `This backend has no handler for ${context.action}`
        );
      }

      const { credentialHandles = [], ...execution } = context;
      const owox = new OWOXApiClient({ transport: createIframeTransport(requester) });
      try {
        const deadline = AbortSignal.timeout(
          Math.max(0, Date.parse(execution.deadlineAt) - Date.now())
        );
        // Not every runtime gives the incoming request a signal.
        const signal = request.signal ? AbortSignal.any([deadline, request.signal]) : deadline;
        const result = await handler(execution.input, {
          owox,
          credentials: createPluginCredentials(requester, credentialHandles),
          collections: <T>(name: string) => createPluginCollection<T>(owox, name),
          execution,
          host: call.host,
          signal,
        });
        return json(200, { result: result ?? null });
      } catch (error) {
        return failure(500, actionErrorCode(error), errorMessage(error));
      }
    },
  };
}

function isExactOrigin(value: string): boolean {
  try {
    return !value.includes('*') && new URL(value).origin === value;
  } catch {
    return false;
  }
}

/** An `https:` DNS name, not an address literal or a name reserved for local networks. */
function isPublicHttpsOrigin(origin: string): boolean {
  const { protocol, hostname } = new URL(origin);
  // WHATWG URL has already turned numeric forms such as https://2130706433 into dotted IPv4.
  const name = hostname.replace(/\.+$/, '');
  return (
    protocol === 'https:' &&
    name.includes('.') &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(name) &&
    !name.startsWith('[') &&
    !LOCAL_NAME_SUFFIXES.some(suffix => `.${name}`.endsWith(suffix))
  );
}

// Both readers swallow their own throws (a code getter, a revoked Proxy), or no answer would leave.
function actionErrorCode(error: unknown): string {
  try {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return typeof code === 'string' &&
      ERROR_CODE_PATTERN.test(code) &&
      !code.startsWith(RESERVED_ERROR_CODE_PREFIX) &&
      !OWOX_ERROR_CODES.has(code)
      ? code
      : 'ACTION_FAILED';
  } catch {
    return 'ACTION_FAILED';
  }
}

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? String(error.message) : String(error);
  } catch {
    return 'The action failed';
  }
}

function failure(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message: message.slice(0, MAX_ERROR_MESSAGE_CHARS) } });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
