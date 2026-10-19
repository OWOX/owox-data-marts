import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

import { PROJECT_DESCRIPTION_MAX_LENGTH } from '../domain/project-description-update.schema';
export { PROJECT_DESCRIPTION_MAX_LENGTH } from '../domain/project-description-update.schema';

export class UpdateProjectDescriptionApiDto {
  @ApiProperty({
    type: String,
    nullable: true,
    minLength: 1,
    maxLength: PROJECT_DESCRIPTION_MAX_LENGTH,
  })
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH)
  description: string | null;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    description: 'Expected settings revision; omit for a legacy unconditional write.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  expectedRevision?: number;
}
