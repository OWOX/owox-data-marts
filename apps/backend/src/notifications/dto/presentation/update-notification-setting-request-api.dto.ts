import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

export class UpdateNotificationSettingApiDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ type: [String], required: false, description: 'User IDs of receivers' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  receivers?: string[];

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf(o => o.webhookUrl !== null)
  @IsUrl({ require_tld: false }, { message: 'webhookUrl must be a valid URL' })
  webhookUrl?: string | null;

  @ApiProperty({ required: false, description: 'Cron expression for grouping delay' })
  @IsOptional()
  @IsString()
  groupingDelayCron?: string;
}
