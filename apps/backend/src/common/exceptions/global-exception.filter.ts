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
    const responseBody: Record<string, unknown> = {
      ...(structured && typeof structured === 'object' && !Array.isArray(structured)
        ? (structured as Record<string, unknown>)
        : {}),
      statusCode: status,
      message:
        responseBodyMessage(structured) ??
        (isHttp && exception instanceof Error ? exception.message : undefined),
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
