import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

export class CreateReportRequestApiDto {
  @ApiProperty({ example: 'My Report' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'ID of the data mart' })
  @IsString()
  @IsNotEmpty()
  dataMartId: string;

  @ApiProperty({ description: 'ID of the data destination' })
  @IsString()
  @IsNotEmpty()
  dataDestinationId: string;

  @ApiProperty({ description: 'Configuration for the data destination' })
  @IsObject()
  @IsNotEmpty()
  destinationConfig: DataDestinationConfig;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ownerIds?: string[];
}
