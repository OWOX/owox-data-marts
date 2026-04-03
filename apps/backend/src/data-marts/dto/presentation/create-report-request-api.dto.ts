import { IsNotEmpty, IsString, IsObject, IsOptional, IsArray } from 'class-validator';
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

  @ApiProperty({
    description: 'Selected columns for the report (null = all native columns)',
    nullable: true,
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columnConfig?: string[] | null;
}
