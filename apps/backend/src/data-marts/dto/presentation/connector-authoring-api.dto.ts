import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsArray, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { MaxJsonSize } from '../../../common/validators/max-json-size.validator';

export class ConnectorPreparationApiDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision: number;
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version: number;
  @ApiProperty({ type: 'array', items: { type: 'array', items: { type: 'string' } } })
  @IsArray()
  protectedPaths: string[][];
  @ApiProperty({ enum: [true] })
  @Equals(true)
  reviewedNonSecretContent: true;
}
export class ConnectorTestApprovalApiDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedRevision: number;
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @MaxJsonSize(120 * 1024)
  configuration: Record<string, unknown>;
}
export class ConnectorRevisionApiDto {
  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevision?: number;
}
export class ConnectorPublishApiDto extends ConnectorRevisionApiDto {
  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
