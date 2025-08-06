import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../data-destination-credentials.type';

/**
 * Interface for processing credentials before saving to data destinations
 * Implementations can generate additional fields, transform data, or apply business logic
 */
export interface DataDestinationCredentialsProcessor extends TypedComponent<DataDestinationType> {
  /**
   * Processes credentials before saving
   * Can generate additional fields, validate, transform data, or apply business logic
   *
   * @param inputCredentials - The credentials provided by the user
   * @param existingCredentials - The existing credentials (for updates), undefined for new destinations
   * @returns The processed credentials ready for saving
   */
  processCredentials(
    inputCredentials: DataDestinationCredentials,
    existingCredentials?: DataDestinationCredentials
  ): Promise<DataDestinationCredentials>;
}
