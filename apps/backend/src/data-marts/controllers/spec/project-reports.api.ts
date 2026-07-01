import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportResponseApiDto } from '../../dto/presentation/report-response-api.dto';
import { OwnerFilter } from '../../enums/owner-filter.enum';

export function ListReportsByProjectSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get all reports for a project' }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description:
        'Maximum number of reports to return. When omitted, the legacy unpaginated response is returned.',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      description: 'Number of reports to skip when limit or offset pagination is used.',
    }),
    ApiQuery({
      name: 'ownerFilter',
      required: false,
      enum: OwnerFilter,
      example: OwnerFilter.HAS_OWNERS,
      description: 'Filter reports by whether they have owners',
    }),
    ApiOkResponse({
      description: 'List of reports for the project',
      type: [ReportResponseApiDto],
    })
  );
}
