import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateInsightArtifactRequestApiDto {
  @ApiProperty({ example: 'Source (updated)', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'SELECT order_id, amount FROM table LIMIT 100' })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
