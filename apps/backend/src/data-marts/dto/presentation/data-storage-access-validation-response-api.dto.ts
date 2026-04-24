import { ApiProperty } from '@nestjs/swagger';

export class DataStorageAccessValidationResponseApiDto {
  @ApiProperty()
  valid!: boolean;

  @ApiProperty()
  errorMessage?: string;

  @ApiProperty({
    required: false,
    enum: ['UNCONFIGURED'],
    description: 'Machine-readable validation result code',
  })
  code?: string;
}
