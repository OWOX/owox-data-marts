import { ApiProperty } from '@nestjs/swagger';

export class IntercomTokenResponseApiDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  token: string;
}
