import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../../idp';

const safe = (v: unknown, maxLength = 5000): string => {
  try {
    if (v == null) return String(v);

    const json = JSON.stringify(v);
    if (json.length <= maxLength) return json;
    return json.slice(0, maxLength) + `… (trimmed ${json.length - maxLength} chars)`;
  } catch {
    try {
      const str = String(v);
      if (str.length <= maxLength) return str;
      return str.slice(0, maxLength) + `… (trimmed ${str.length - maxLength} chars)`;
    } catch {
      return '[unserializable]';
    }
  }
};

function isHttpError(e: unknown): e is { getStatus(): number; getResponse?: () => unknown } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'getStatus' in e &&
    typeof (e as Record<string, unknown>).getStatus === 'function'
  );
}

/**
 * Extract a human-readable `message` string from a structured exception
 * response when present. NestJS HttpException accepts either a string, or an
 * object that may carry a `message` key alongside extra payload fields (e.g.
 * `affectedMemberIds` for context-delete conflicts). We surface that string
 * directly so the client sees the actionable wording instead of the generic
 * exception name.
 */
function responseBodyMessage(structured: unknown): string | undefined {
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    const msg = (structured as Record<string, unknown>).message;
    if (typeof msg === 'string') return msg;
  }
  return undefined;
}

/** Header used when the body carries a constraint list instead of a written sentence. */
const VALIDATION_FAILED_MESSAGE = 'Request validation failed';

/**
 * The per-constraint reasons NestJS's `ValidationPipe` puts in the body's `message` as a string
 * ARRAY — one entry per failed class-validator rule ("title must be a string", "property foo
 * should not exist").
 *
 * `responseBodyMessage` only accepts a string, so that array used to fall through to
 * `exception.message`, which `HttpException` derives from the class name whenever the body's
 * message is not a string — the literal "Bad Request Exception". Every reason was dropped before
 * the response left the process, and the caller was told only that something was wrong.
 */
function validationConstraints(structured: unknown): string[] | undefined {
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) return undefined;
  const msg = (structured as Record<string, unknown>).message;
  if (!Array.isArray(msg)) return undefined;
  const constraints = msg
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    .map(asSentence);
  return constraints.length > 0 ? constraints : undefined;
}

/**
 * class-validator writes bare clauses ("title must be a string"). The interface concatenates the
 * entries of one `details.errors` list into a single line, so without terminal punctuation two
 * constraints run together into one unreadable sentence.
 */
function asSentence(constraint: string): string {
  const text = constraint.trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Whether the body already carries its own `details` envelope — a caller that built one
 * deliberately (the output-controls validator, the Zod mappers) owns it, and its structured codes
 * are richer than anything reconstructed from sentences.
 */
function hasOwnDetails(structured: unknown): boolean {
  return (
    !!structured &&
    typeof structured === 'object' &&
    !Array.isArray(structured) &&
    (structured as Record<string, unknown>).details !== undefined
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    const isHttp = isHttpError(exception);
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const structured =
      isHttp && typeof exception.getResponse === 'function' ? exception.getResponse() : undefined;
    const constraints = validationConstraints(structured);
    const responseBody: Record<string, unknown> = {
      ...(structured && typeof structured === 'object' && !Array.isArray(structured)
        ? (structured as Record<string, unknown>)
        : {}),
      statusCode: status,
      message:
        responseBodyMessage(structured) ??
        (constraints ? VALIDATION_FAILED_MESSAGE : undefined) ??
        (isHttp && exception instanceof Error ? exception.message : undefined),
      // The constraints travel STRUCTURED rather than folded into `message`: `message` is a string
      // for every other error this filter emits and callers call string methods on it directly, and
      // `details.errors[]` is the envelope the interface already renders — capped and de-duplicated
      // — for the output-controls validator, so a DTO failing twenty rules cannot wall off a toast.
      ...(constraints && !hasOwnDetails(structured)
        ? { details: { errors: constraints.map(message => ({ message })) } }
        : {}),
      timestamp: new Date().toISOString(),
      path: request?.originalUrl || request?.url,
      requestId: (request?.headers?.['x-request-id'] as string) || undefined,
    };

    const err =
      exception instanceof Error
        ? exception
        : new Error(typeof exception === 'string' ? exception : 'Unhandled exception');

    const logBody = {
      status,
      method: request?.method,
      url: request?.originalUrl || request?.url,
      requestId: responseBody.requestId,
      isHttpError: isHttp,
      query: safe(request?.query),
      params: safe(request?.params),
    };

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception caught by ${GlobalExceptionFilter.name}`,
        err,
        logBody
      );
    } else {
      this.logger.log(`Handled HTTP ${status} by ${GlobalExceptionFilter.name}`, {
        ...logBody,
        error: err,
      });
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json(responseBody);
  }
}
