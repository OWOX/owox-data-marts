import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: '1234567890' })
  credentialId: string;

  @ApiProperty({ type: ConnectorOAuthStatusUserApiDto })
  user?: ConnectorOAuthStatusUserApiDto;

  @ApiProperty({ example: { scope: 'read,write' } })
  additional?: Record<string, unknown>;

  @ApiProperty({ example: ['Invalid credentials'] })
  reasons?: string[];
}
