import { DataMartConfigurationPreconditionDto } from './data-mart-configuration-precondition.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

/**
 * DTO for updating a scheduled trigger API request
 */
export class UpdateScheduledTriggerRequestApiDto extends DataMartConfigurationPreconditionDto {
  @ApiProperty({ example: '0 0 * * *' })
  @IsString()
  cronExpression: string;

  @ApiProperty({ example: 'UTC' })
  @IsString()
  timeZone: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;
}
