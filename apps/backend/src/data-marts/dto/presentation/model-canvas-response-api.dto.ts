import { ApiProperty } from '@nestjs/swagger';
import { DataMartStatus } from '../../enums/data-mart-status.enum';

export class ModelCanvasNodeApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'Orders' })
  title: string;

  @ApiProperty({ enum: DataMartStatus, example: DataMartStatus.PUBLISHED })
  status: DataMartStatus;

  @ApiProperty({ type: String, example: 'All orders enriched with customer data', nullable: true })
  description: string | null;

  @ApiProperty({ example: 12, description: 'Number of fields in the output schema' })
  fieldCount: number;
}

export class ModelCanvasJoinConditionApiDto {
  @ApiProperty({ example: 'customer_id' })
  sourceFieldName: string;

  @ApiProperty({ example: 'id' })
  targetFieldName: string;
}

export class ModelCanvasEdgeApiDto {
  @ApiProperty({ example: '2f6c1f88-0000-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  sourceDataMartId: string;

  @ApiProperty({ example: '7b1de930-5678-4c3b-9d34-fedcba654321' })
  targetDataMartId: string;

  @ApiProperty({ type: [ModelCanvasJoinConditionApiDto] })
  joinConditions: ModelCanvasJoinConditionApiDto[];
}

export class ModelCanvasDataMartsResponseApiDto {
  @ApiProperty({ type: [ModelCanvasNodeApiDto] })
  items: ModelCanvasNodeApiDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({
    type: Number,
    example: 50,
    nullable: true,
    description: 'Next offset to fetch, null if no more data',
  })
  nextOffset: number | null;
}

export class ModelCanvasEdgesResponseApiDto {
  @ApiProperty({ type: [ModelCanvasEdgeApiDto] })
  edges: ModelCanvasEdgeApiDto[];
}
