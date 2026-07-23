import { ApiProperty } from '@nestjs/swagger';

export class DataMartListItemContextApiDto {
  @ApiProperty({ description: 'Context identifier' })
  id: string;

  @ApiProperty({ description: 'Context display name' })
  name: string;
}
