import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  IdpError,
  AuthenticationError,
  AuthorizationError,
  TokenExpiredError,
  InvalidTokenError,
} from '@owox/idp-protocol';

@Catch(IdpError)
export class IdpExceptionFilter implements ExceptionFilter {
  catch(exception: IdpError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = exception.statusCode || HttpStatus.BAD_REQUEST;

    if (exception instanceof AuthenticationError) {
      status = HttpStatus.UNAUTHORIZED;
    } else if (exception instanceof AuthorizationError) {
      status = HttpStatus.FORBIDDEN;
    } else if (exception instanceof TokenExpiredError) {
      status = HttpStatus.UNAUTHORIZED;
    } else if (exception instanceof InvalidTokenError) {
      status = HttpStatus.UNAUTHORIZED;
    }

    const errorResponse = {
      statusCode: status,
      message: exception.message,
      code: exception.code,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorResponse);
  }
}
