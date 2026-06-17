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

    this.logger.warn('MCP auth rejected', {
      method: request?.method,
      url: request?.originalUrl ?? request?.url,
      requestSessionId: this.getRequestedSessionId(request),
      accept: request?.headers?.accept,
      contentType: request?.headers?.['content-type'],
      hasAuthorization: Boolean(request?.headers?.authorization),
      message,
    });

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

  private getMessage(exception: UnauthorizedException): string {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const message = (response as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    return exception.message;
  }
}
