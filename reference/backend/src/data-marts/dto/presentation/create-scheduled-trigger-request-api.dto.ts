import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ScheduledTriggerConfig } from '../../scheduled-trigger-types/scheduled-trigger-config.type';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class CreateScheduledTriggerRequestApiDto {
  @ApiProperty({ enum: ScheduledTriggerType, example: ScheduledTriggerType.CONNECTOR_RUN })
  @IsEnum(ScheduledTriggerType)
  @IsNotEmpty()
  type: ScheduledTriggerType;

  @ApiProperty({ example: '0 0 * * *' })
  @IsString()
  @IsNotEmpty()
  cronExpression: string;

  @ApiProperty({ example: 'UTC' })
  @IsString()
  @IsNotEmpty()
  timeZone: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsObject()
  @IsOptional()
  triggerConfig?: ScheduledTriggerConfig;
}
