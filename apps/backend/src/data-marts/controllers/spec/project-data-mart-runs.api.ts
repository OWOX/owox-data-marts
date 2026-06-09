import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectDataMartRunsResponseApiDto } from '../../dto/presentation/project-data-mart-runs-response-api.dto';

export function GetProjectDataMartRunsSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'Get project DataMart run history' }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      example: 100,
      description: 'Maximum number of runs to return. Defaults to 100; max 100.',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      example: 0,
      description: 'Number of runs to skip before returning results',
    }),
    ApiOkResponse({ type: ProjectDataMartRunsResponseApiDto })
  );
}
