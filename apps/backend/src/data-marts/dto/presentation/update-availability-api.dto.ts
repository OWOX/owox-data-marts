import { IsBoolean } from 'class-validator';

export class UpdateDataMartAvailabilityApiDto {
  @IsBoolean()
  availableForReporting: boolean;

  @IsBoolean()
  availableForMaintenance: boolean;
}

export class UpdateStorageAvailabilityApiDto {
  @IsBoolean()
  availableForUse: boolean;

  @IsBoolean()
  availableForMaintenance: boolean;
}

export class UpdateDestinationAvailabilityApiDto {
  @IsBoolean()
  availableForUse: boolean;

  @IsBoolean()
  availableForMaintenance: boolean;
}
