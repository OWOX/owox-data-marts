import { ApiProperty } from '@nestjs/swagger';

export class ConnectorSpecificationResponseApiDto {
  @ApiProperty({ example: 'accessToken' })
  name: string;

  @ApiProperty({ example: 'Access Token', required: false })
  title?: string;

  @ApiProperty({ example: 'Your Facebook access token', required: false })
  description?: string;

  @ApiProperty({ example: 'default_value', required: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: any;

  @ApiProperty({
    enum: ['string', 'number', 'boolean', 'bool', 'object', 'array', 'date'],
    example: 'string',
    required: false,
  })
  requiredType?: 'string' | 'number' | 'boolean' | 'bool' | 'object' | 'array' | 'date';

  @ApiProperty({ example: true, required: false })
  required?: boolean;

  @ApiProperty({
    type: [String],
    example: ['option1', 'option2'],
    required: false,
  })
  options?: string[];

  @ApiProperty({ example: 'Enter your access token...', required: false })
  placeholder?: string;
}
