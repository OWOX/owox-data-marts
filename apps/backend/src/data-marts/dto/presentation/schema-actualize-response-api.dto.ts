import { ApiProperty } from '@nestjs/swagger';

export class SchemaActualizeResponseApiDto {
  @ApiProperty({
    description: 'Whether schema actualization completed successfully',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Error message if failed',
    required: false,
  })
  error?: string;
}
