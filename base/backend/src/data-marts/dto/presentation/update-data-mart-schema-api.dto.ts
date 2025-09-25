import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmptyObject } from 'class-validator';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class UpdateDataMartSchemaApiDto {
  @ApiProperty({
    type: () => Object,
    required: true,
    description: 'Updated schema of the data mart',
  })
  @IsNotEmptyObject()
  schema: DataMartSchema;
}
