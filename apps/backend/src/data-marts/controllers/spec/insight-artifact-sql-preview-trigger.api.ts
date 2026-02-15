import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RunInsightArtifactSqlPreviewRequestApiDto } from '../../dto/presentation/run-insight-artifact-sql-preview-request-api.dto';

export function CreateInsightArtifactSqlPreviewTriggerSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new Insight Artifact SQL preview trigger',
      description:
        'Initiates asynchronous SQL preview for the specified Insight Artifact. Returns a trigger ID to check status and retrieve preview rows.',
    }),
    ApiParam({ name: 'dataMartId', description: 'DataMart ID' }),
    ApiParam({ name: 'insightArtifactId', description: 'Insight Artifact ID' }),
    ApiBody({ type: RunInsightArtifactSqlPreviewRequestApiDto, required: false }),
    ApiCreatedResponse({
      description: 'Trigger created successfully',
      schema: {
        type: 'object',
        properties: {
          triggerId: {
            type: 'string',
            description: 'ID of the created trigger',
            example: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      },
    })
  );
}
