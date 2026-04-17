import { ApiProperty } from '@nestjs/swagger';
import { ProjectSetupSteps } from '../domain/project-setup-steps.interface';

export class ProjectSetupProgressResponseApiDto {
  @ApiProperty({ example: 1, description: 'API contract version' })
  version: number;

  @ApiProperty({ example: 1, description: 'Schema version of the persisted steps JSON' })
  stepsSchemaVersion: number;

  @ApiProperty({ example: 42, description: 'Percentage of completed steps (0..100)' })
  progress: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Per-step state (project-scoped + user-scoped, merged)',
  })
  steps: ProjectSetupSteps;
}
