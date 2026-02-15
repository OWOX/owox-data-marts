import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateInsightArtifactRequestApiDto {
  @ApiProperty({ example: 'Source', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ example: 'SELECT * FROM table LIMIT 100' })
  @IsString()
  @IsNotEmpty()
  sql: string;
}
