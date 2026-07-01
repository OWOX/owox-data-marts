import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeProjectMemberApiKeyRequestApiDto {
  @ApiProperty({ example: 'vjqmM5GfJ6QklV8mFqM5Ior2hK6vK4mY8pE9T7aZr6Q' })
  @IsString()
  @IsNotEmpty()
  apiKeySecret: string;
}
