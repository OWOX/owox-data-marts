import { ApiProperty } from '@nestjs/swagger';
import { JoinCondition } from '../schemas/relationship-schemas';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';

export class DataMartRefApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: 'My Data Mart' })
  title: string;

  @ApiProperty({ example: 'Revenue by channel', required: false })
  description?: string;

  @ApiProperty({ enum: DataMartStatus, example: DataMartStatus.PUBLISHED })
  status: DataMartStatus;
}

export class RelationshipResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  dataStorageId: string;

  @ApiProperty({ type: DataMartRefApiDto })
  sourceDataMart: DataMartRefApiDto;

  @ApiProperty({ type: DataMartRefApiDto })
  targetDataMart: DataMartRefApiDto;

  @ApiProperty({ example: 'orders' })
  targetAlias: string;

  @ApiProperty()
  joinConditions: JoinCondition[];

  @ApiProperty({ example: 'user-id-123' })
  createdById: string;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;

  @ApiProperty({ type: UserProjectionDto, required: false, nullable: true })
  createdByUser?: UserProjectionDto | null;
}
