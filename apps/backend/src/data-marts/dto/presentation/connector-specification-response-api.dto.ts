import { ApiProperty } from '@nestjs/swagger';

export class ConnectorSpecificationItemResponseApiDto {
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

  @ApiProperty({
    type: [String],
    example: ['MANUAL_BACKFILL', 'HIDE_IN_UI'],
    required: false,
  })
  attributes?: string[];
}

export class ConnectorSpecificationOneOfOptionResponseApiDto {
  @ApiProperty({ example: 'Access Token' })
  label: string;

  @ApiProperty({ example: 'accessToken' })
  value: string;

  @ApiProperty({
    enum: ['string', 'number', 'boolean', 'bool', 'object', 'array', 'date'],
    example: 'string',
    required: false,
  })
  requiredType?: 'string' | 'number' | 'boolean' | 'bool' | 'object' | 'array' | 'date';

  @ApiProperty({
    type: [String],
    example: ['SECRET', 'OAUTH_FLOW'],
    required: false,
  })
  attributes?: string[];

  @ApiProperty({
    type: [ConnectorSpecificationItemResponseApiDto],
    example: [
      {
        name: 'apiKey',
        title: 'API Key',
        description: 'Your API key',
        default: 'default_value',
        requiredType: 'string',
        required: true,
        options: ['option1', 'option2'],
        placeholder: 'Enter your API key...',
        attributes: ['MANUAL_BACKFILL', 'HIDE_IN_UI'],
      },
    ],
  })
  items: Record<string, ConnectorSpecificationItemResponseApiDto>;
}

export class ConnectorSpecificationResponseApiDto extends ConnectorSpecificationItemResponseApiDto {
  @ApiProperty({
    type: [ConnectorSpecificationOneOfOptionResponseApiDto],
    example: [
      {
        label: 'Access Token',
        value: 'accessToken',
        requiredType: 'string',
        items: [
          {
            name: 'apiKey',
            title: 'API Key',
            description: 'Your API key',
            default: 'default_value',
            requiredType: 'string',
            required: true,
            options: ['option1', 'option2'],
            placeholder: 'Enter your API key...',
            attributes: ['MANUAL_BACKFILL', 'HIDE_IN_UI'],
          },
        ],
      },
    ],
    required: false,
  })
  oneOf?: ConnectorSpecificationOneOfOptionResponseApiDto[];
}
