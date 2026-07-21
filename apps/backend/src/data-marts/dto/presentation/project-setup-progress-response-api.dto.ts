import { ApiProperty } from '@nestjs/swagger';

export class ProjectSetupStepStateApiDto {
  @ApiProperty({ description: 'Whether the setup step is complete' })
  done: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the setup step was completed, or null while incomplete',
  })
  completedAt: string | null;
}

export class ProjectSetupStepsApiDto {
  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasStorage: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasDraftDataMart: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasPublishedDataMart: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasDestination: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasReport: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasReportRun: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasTeammatesInvited: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasGoogleSheetsDestination: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasGoogleSheetsExtension: ProjectSetupStepStateApiDto;

  @ApiProperty({ type: ProjectSetupStepStateApiDto })
  hasGoogleSheetsReportRun: ProjectSetupStepStateApiDto;
}

export class ProjectSetupProgressResponseApiDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1, description: 'API contract version' })
  version: number;

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    example: 1,
    description: 'Schema version of the persisted steps JSON',
  })
  stepsSchemaVersion: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 100,
    example: 42,
    description: 'Percentage of completed steps (0..100)',
  })
  progress: number;

  @ApiProperty({
    type: ProjectSetupStepsApiDto,
    description: 'Per-step state (project-scoped + user-scoped, merged)',
  })
  steps: ProjectSetupStepsApiDto;
}
