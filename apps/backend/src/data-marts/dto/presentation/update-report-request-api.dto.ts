import { ArrayMaxSize, IsNotEmpty, IsString, IsObject, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DataDestinationConfig } from '../../data-destination-types/data-destination-config.type';

export class UpdateReportRequestApiDto {
  @ApiProperty({ example: 'My Report' })
  @IsString()
  @IsNotEmpty()
  title: string;

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
