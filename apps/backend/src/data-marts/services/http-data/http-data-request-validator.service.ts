import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
  HttpDataQuery,
  HttpDataQuerySchema,
  HttpReportDataQuery,
  HttpReportDataQuerySchema,
} from '../../dto/schemas/http-data-query.schema';

@Injectable()
export class HttpDataRequestValidator {
  private readonly logger = new Logger(HttpDataRequestValidator.name);

  validate(rawQuery: Record<string, unknown>): HttpDataQuery {
    const result = HttpDataQuerySchema.safeParse(rawQuery);
    if (!result.success) {
      this.reject(result.error);
    }
    return result.data;
  }

  validateReportQuery(rawQuery: Record<string, unknown>): HttpReportDataQuery {
    const result = HttpReportDataQuerySchema.safeParse(rawQuery);
    if (!result.success) {
      this.reject(result.error);
    }
    return result.data;
  }

  private reject(error: ZodError): never {
    const message = error.issues
      .map(issue => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');
    this.logger.log('Rejected data request: invalid query parameters', {
      issues: error.issues.map(({ code, path }) => ({ code, path })),
    });
    throw new BusinessViolationException(message);
  }
}
