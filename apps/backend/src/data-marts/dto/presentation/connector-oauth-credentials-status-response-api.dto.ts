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

export class ConnectorOAuthStatusResponseApiDto {
  @ApiProperty({ example: true })
  valid: boolean;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  expiresAt?: Date;

  @ApiProperty({ type: ConnectorOAuthStatusUserApiDto })
  user?: ConnectorOAuthStatusUserApiDto;

  @ApiProperty({ example: { scope: 'read,write' } })
  additional?: Record<string, unknown>;
}
