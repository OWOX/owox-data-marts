import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectScheduledTriggersResponseApiDto } from '../../dto/presentation/project-scheduled-triggers-response-api.dto';

export function ListProjectScheduledTriggersSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'List scheduled triggers across accessible Data Marts in the project',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Maximum number of triggers to return. Defaults to 100; max 100.',
    }),
    ApiQuery({
      name: 'offset',
      required: false,
      type: Number,
      description: 'Number of triggers to skip. Defaults to 0.',
    }),
    ApiOkResponse({
      description: 'Project scheduled triggers visible to the current user',
      type: ProjectScheduledTriggersResponseApiDto,
    })
  );
}
