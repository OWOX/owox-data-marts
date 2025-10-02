import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SqlDryRunRequestApiDto {
  @ApiProperty({
    description: 'SQL query to validate',
    example: 'SELECT * FROM table_name',
  })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
