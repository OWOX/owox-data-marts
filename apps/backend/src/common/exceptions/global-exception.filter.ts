import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<AuthenticatedRequest>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const httpResponsePayload = isHttp ? (exception as HttpException).getResponse() : undefined;

    const responseBody = {
      statusCode: status,
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
      query: safe(request?.query),
      params: safe(request?.params),
      httpResponse: safe(httpResponsePayload),
    };

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception caught by ${GlobalExceptionFilter.name}`,
        err,
        logBody
      );
    } else {
      this.logger.log(`Handled HTTP ${status} by ${GlobalExceptionFilter.name}`, logBody);
    }

    if (response.headersSent) {
      try {
        response.end();
      } catch {
        // ignore
      }
      return;
    }

    response.status(status).json(responseBody);
  }
}
