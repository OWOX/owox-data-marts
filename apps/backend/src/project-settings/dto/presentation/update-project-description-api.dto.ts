import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export const PROJECT_DESCRIPTION_MAX_LENGTH = 10_000;

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
}
