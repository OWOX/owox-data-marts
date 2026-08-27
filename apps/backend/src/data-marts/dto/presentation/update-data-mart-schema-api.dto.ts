import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmptyObject } from 'class-validator';
import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';
import { DataMartResponseApiDto } from './data-mart-response-api.dto';

export class UpdateDataMartSchemaApiDto {
  @ApiProperty({
    type: () => Object,
    required: true,
    description: 'Updated schema of the data mart',
  })
  @IsNotEmptyObject()
  schema: DataMartSchema;
}

export class FormulaViolationApiDto {
  @ApiProperty({
    example: 'FORMULA_LEVEL_MIXING',
    description: 'Machine-readable violation code',
  })
  code: string;

  @ApiProperty({ description: 'Human-readable explanation of the violation' })
  message: string;

  @ApiProperty({ description: 'The calculated field this violation belongs to' })
  field: string;

  @ApiProperty({
    required: false,
    example: 'clicks',
    description:
      'What inside the formula the message is about — a reference label or a function name — for ' +
      'a client that wants to point at it (an editor marker, a highlight). Absent when the ' +
      'violation is about the formula as a whole.',
  })
  subject?: string;
}

export class UpdateDataMartSchemaResponseApiDto extends DataMartResponseApiDto {
  @ApiProperty({
    type: [FormulaViolationApiDto],
    required: false,
    description:
      'Non-blocking calculated-field formula warnings surfaced by this save, e.g. an unguarded division.',
  })
  warnings?: FormulaViolationApiDto[];
}
