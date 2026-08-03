import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { BaseException } from './base.exception';
import { BusinessViolationException } from './business-violation.exception';

@Catch(BusinessViolationException)
export class BaseExceptionFilter implements ExceptionFilter {
  catch(exception: BaseException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
      // Spread so exceptions that carry no code keep their existing response shape.
      ...(exception.code ? { code: exception.code } : {}),
      errorDetails: exception.errorDetails,
    });
  }
}
