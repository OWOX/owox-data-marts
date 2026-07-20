import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class GoogleSheetsFieldsPreviewRequestApiDto {
  @ApiProperty({
    type: Object,
    description: 'Connector source configuration used to detect dynamic fields.',
  })
  @IsObject()
  configuration: Record<string, unknown>;
}
