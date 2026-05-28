import { Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { HttpDataQuery, HttpDataQuerySchema } from '../../dto/schemas/http-data-query.schema';

@Injectable()
export class HttpDataRequestValidator {
  validate(rawQuery: Record<string, unknown>): HttpDataQuery {
    const result = HttpDataQuerySchema.safeParse(rawQuery);
    if (!result.success) {
      const message = result.error.issues
        .map(issue => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      throw new BusinessViolationException(message);
    }
    return result.data;
  }
}
