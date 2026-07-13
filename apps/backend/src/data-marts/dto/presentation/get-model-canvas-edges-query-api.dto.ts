import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetModelCanvasEdgesQueryApiDto {
  @ApiProperty({ description: 'Data storage ID scoping the canvas' })
  @IsUUID()
  storageId: string;
}
