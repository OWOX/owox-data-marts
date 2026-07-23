import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectDataMartRunsResponseApiDto } from '../../dto/presentation/project-data-mart-runs-response-api.dto';

export function GetProjectDataMartRunsSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get project DataMart run history',
      description:
        'Returns newest-first runs for Data Marts visible to the current project member. ' +
        'Viewer access is required.',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      example: 100,
      description:
        'Maximum page size. Values default to 100 when absent, non-finite, or non-positive; ' +
        'finite fractions are floored and values above 100 are capped at 100.',
      schema: {
        type: 'number',
        default: 100,
      },
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      example: 0,
      description:
        'Number of newest runs to skip. Values default to 0 when absent, non-finite, or ' +
        'non-positive; finite fractions are floored and values above 100,000 are capped at 100,000.',
      schema: {
        type: 'number',
        default: 0,
      },
    }),
    ApiOkResponse({
      description: 'Project-visible Data Mart runs in newest-first order.',
      type: ProjectDataMartRunsResponseApiDto,
    })
  );
}
