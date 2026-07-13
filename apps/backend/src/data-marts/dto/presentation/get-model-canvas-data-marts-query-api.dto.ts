import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class GetModelCanvasDataMartsQueryApiDto {
  @ApiProperty({ description: 'Data storage ID scoping the canvas' })
  @IsUUID()
  storageId: string;

  @ApiPropertyOptional({
    description: 'Number of data marts to skip before returning results',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
