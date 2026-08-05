import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PluginHostError } from '../errors/plugin-host.errors';

/**
 * Keeps publisher diagnostics out of member-facing responses.
 *
 * PluginHostError declares whether a member may see its detail, but nothing enforced
 * it: the default filter renders whatever it is handed. So a member pressing
 * Check and update could receive a GitHub App installation URL, a private repository
 * name, an access mode, or two commit SHAs -- all source diagnostics §16 restricts to
 * authorized publisher-management operations.
 *
 * Applied per controller with @UseFilters rather than globally, because the same error
 * on a publisher route must keep its detail. Which audience a route serves is a
 * property of the route, and only the route knows it.
 */
@Catch(PluginHostError)
export class PluginHostExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PluginHostExceptionFilter.name);

  catch(exception: PluginHostError, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (!exception.memberVisible) {
      // Logged in full server-side: the operator still needs the diagnosis that the
      // member is not entitled to.
      this.logger.warn(
        `Withheld ${exception.code} detail from a member-facing response: ${exception.message}`,
        exception.errorDetails
      );
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      timestamp: new Date().toISOString(),
      path: request.url,
      // The code stays either way, so clients keep a stable branch point without
      // learning anything about the plugin's source.
      code: exception.code,
      ...(exception.memberVisible
        ? { message: exception.message, errorDetails: exception.errorDetails }
        : { message: 'This plugin could not be read. Ask the publisher to check it.' }),
    });
  }
}
