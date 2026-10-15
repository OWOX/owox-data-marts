import { isPluginOwnedErrorCode, PLUGIN_ACTION_LIMITS } from '../constants/plugin-action-limits';
import { PluginActionExecutionStatus } from '../enums/plugin-action-execution-status.enum';
import { findJsonShapeProblem } from './json-shape.util';

export type PluginActionOutcome =
  | { status: PluginActionExecutionStatus.SUCCEEDED; result: unknown }
  | { status: PluginActionExecutionStatus.FAILED; errorCode: string; errorMessage: string };

/** Maps a backend's answer onto the final state; a null `body` was over the read cap. */
export function classifyBackendResponse(status: number, body: string | null): PluginActionOutcome {
  try {
    return classify(status, body);
  } catch {
    // Valid JSON can still throw here, e.g. an error message with no primitive value.
    return invalid('The backend answer could not be read');
  }
}

function classify(status: number, body: string | null): PluginActionOutcome {
  if (body === null) {
    return invalid('The backend answer is larger than allowed');
  }
  if (status >= 300 && status < 400) {
    return invalid(`The backend answered ${status}`);
  }

  const parsed = parseJson(body);

  if (status === 200) {
    if (!isRecord(parsed) || !Object.hasOwn(parsed, 'result')) {
      return invalid('The backend answered 200 without a result');
    }
    const problem = findJsonShapeProblem(parsed.result);
    if (problem) {
      return invalid(`The result ${problem}`);
    }
    if (Buffer.byteLength(JSON.stringify(parsed.result)) > PLUGIN_ACTION_LIMITS.maxResultBytes) {
      return invalid('The result is larger than 1 MiB');
    }
    return { status: PluginActionExecutionStatus.SUCCEEDED, result: parsed.result };
  }
  if (status < 300) {
    return invalid(`The backend answered ${status}`);
  }

  const error = isRecord(parsed) ? parsed.error : undefined;
  if (isRecord(error) && isPluginOwnedErrorCode(error.code)) {
    return {
      status: PluginActionExecutionStatus.FAILED,
      errorCode: error.code,
      errorMessage: String(error.message ?? '').slice(0, PLUGIN_ACTION_LIMITS.maxErrorMessageChars),
    };
  }
  return invalid(`The backend answered ${status} without a usable error code`);
}

function invalid(errorMessage: string): PluginActionOutcome {
  return {
    status: PluginActionExecutionStatus.FAILED,
    errorCode: 'BACKEND_INVALID_RESPONSE',
    errorMessage,
  };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
