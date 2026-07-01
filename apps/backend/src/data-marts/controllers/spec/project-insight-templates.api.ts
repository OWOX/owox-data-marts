import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectInsightTemplatesResponseApiDto } from '../../dto/presentation/project-insight-templates-response-api.dto';

export function ListProjectInsightTemplatesSpec() {
  return applyDecorators(
    ApiOperation({ summary: 'List insight templates across accessible Data Marts in the project' }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Maximum number of insight templates to return. Defaults to 100; max 100.',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      description: 'Number of insight templates to skip. Defaults to 0.',
    }),
    ApiOkResponse({
      description: 'Project insight templates visible to the current user',
      type: ProjectInsightTemplatesResponseApiDto,
    })
  );
}
