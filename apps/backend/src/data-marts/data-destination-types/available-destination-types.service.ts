import { Injectable } from '@nestjs/common';
import { AppEditionConfig } from '../../common/config/app-edition-config.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataDestinationType } from './enums/data-destination-type.enum';

/**
 * Service to manage available data destination types based on the application's edition.
 * Determines which destination types are allowed and provides methods to validate and retrieve them.
 */
@Injectable()
export class AvailableDestinationTypesService {
  constructor(private readonly appEditionConfig: AppEditionConfig) {}

  list(): DataDestinationType[] {
    if (this.appEditionConfig.isEnterpriseEdition()) {
      return [
        DataDestinationType.GOOGLE_SHEETS,
        DataDestinationType.LOOKER_STUDIO,
        DataDestinationType.EMAIL,
        DataDestinationType.SLACK,
        DataDestinationType.MS_TEAMS,
        DataDestinationType.GOOGLE_CHAT,
      ];
    }
    return [DataDestinationType.GOOGLE_SHEETS, DataDestinationType.LOOKER_STUDIO];
  }

  isAllowed(type: DataDestinationType): boolean {
    return this.list().includes(type);
  }

  verifyIsAllowed(type: DataDestinationType): void {
    if (!this.isAllowed(type)) {
      throw new BusinessViolationException(
        `Destination type ${type} is not allowed in this app edition`
      );
    }
  }
}
