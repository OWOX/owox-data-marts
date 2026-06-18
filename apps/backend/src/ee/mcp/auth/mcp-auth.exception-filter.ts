import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpConfigService } from '../config/mcp.config';

@Catch(UnauthorizedException)
export class McpAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(McpAuthExceptionFilter.name);

  constructor(private readonly config: McpConfigService) {}

  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = typeof http.getRequest === 'function' ? http.getRequest<Request>() : undefined;
    const response = http.getResponse<Response>();
    const message = this.getMessage(exception);
    const metadata = {
      method: request?.method,
      url: request?.originalUrl ?? request?.url,
      requestSessionId: this.getRequestedSessionId(request),
      accept: request?.headers?.accept,
      contentType: request?.headers?.['content-type'],
      hasAuthorization: Boolean(request?.headers?.authorization),
      message,
    };

    if (this.isExpectedAnonymousProbe(request, message)) {
      this.logger.log('MCP auth rejected', metadata);
    } else {
      this.logger.warn('MCP auth rejected', metadata);
    }

    response.setHeader('WWW-Authenticate', this.getChallengeHeader());
    response.status(401).json({
      statusCode: 401,
      message,
      error: 'Unauthorized',
    });
  }

  private getRequestedSessionId(request: Request | undefined): string | undefined {
    const header = request?.headers?.['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
  }

  private getChallengeHeader(): string {
    return `Bearer resource_metadata="${this.config.protectedResourceMetadataUrl}", scope="${this.config.scopes.join(' ')}"`;
  }

  private isExpectedAnonymousProbe(request: Request | undefined, message: string): boolean {
    return (
      request?.method === 'GET' &&
      (request.originalUrl ?? request.url) === '/mcp' &&
      !request.headers?.authorization &&
      message === 'Missing MCP bearer token'
    );
  }

  private getMessage(exception: UnauthorizedException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    return exception.message;
  }
}
