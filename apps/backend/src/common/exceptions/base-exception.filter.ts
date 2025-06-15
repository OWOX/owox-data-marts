import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { AccessValidationException } from './access-validation.exception';
import { Response } from 'express';
import { BaseException } from './base.exception';

@Catch(AccessValidationException)
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
      errorDetails: exception.errorDetails,
    });
  }
}
