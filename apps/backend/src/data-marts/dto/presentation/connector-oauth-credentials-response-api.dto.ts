import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectorOAuthStatusUserApiDto {
  @ApiProperty({ example: '1234567890' })
  id?: string;
  @ApiProperty({ example: 'John Doe' })
  name?: string;
  @ApiProperty({ example: 'john.doe@example.com' })
  email?: string;
  @ApiProperty({ example: 'https://example.com/picture.jpg' })
  picture?: string;
}

export class ConnectorOAuthCredentialsResponseApiDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: 'The Credential id', example: '1234567890' })
  credentialId: string;

  @ApiProperty({ type: ConnectorOAuthStatusUserApiDto })
  user?: ConnectorOAuthStatusUserApiDto;

  @ApiProperty({ example: ['Invalid credentials'] })
  reasons?: string[];

  @ApiPropertyOptional({
    description:
      "Google Picker's access token for the member who just signed in; only for a connector that opens Picker",
  })
  pickerAccessToken?: string;
}
