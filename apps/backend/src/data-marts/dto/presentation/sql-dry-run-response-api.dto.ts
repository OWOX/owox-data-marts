import { ApiProperty } from '@nestjs/swagger';

export class SqlDryRunResponseApiDto {
  @ApiProperty({
    description: 'Whether the SQL query is valid',
    example: true,
  })
  isValid: boolean;

  @ApiProperty({
    description: 'Error message if validation failed',
    example: 'Syntax error at line 1',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Estimated bytes to be processed',
    example: 1024,
    required: false,
  })
  bytes?: number;
}
