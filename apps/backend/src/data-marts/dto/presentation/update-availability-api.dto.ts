import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDataMartAvailabilityApiDto {
  @ApiProperty({ required: false, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;

  @ApiProperty({
    description: 'Whether the DataMart is available for reporting',
    example: true,
  })
  @IsBoolean()
  availableForReporting: boolean;

  @ApiProperty({
    description: 'Whether the DataMart is available for maintenance',
    example: false,
  })
  @IsBoolean()
  availableForMaintenance: boolean;
}

export class UpdateStorageAvailabilityApiDto {
  @ApiProperty({
    description: 'Whether the Data Storage is available for use',
    example: true,
  })
  @IsBoolean()
  availableForUse: boolean;

  @ApiProperty({
    description: 'Whether the Data Storage is available for maintenance',
    example: false,
  })
  @IsBoolean()
  availableForMaintenance: boolean;
}

export class UpdateDestinationAvailabilityApiDto {
  @ApiProperty({
    description: 'Whether the Data Destination is available for use',
    example: true,
  })
  @IsBoolean()
  availableForUse: boolean;

  @ApiProperty({
    description: 'Whether the Data Destination is available for maintenance',
    example: false,
  })
  @IsBoolean()
  availableForMaintenance: boolean;
}
