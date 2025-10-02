import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationConfig } from '../data-destination-config.type';
import { DataDestination } from '../../entities/data-destination.entity';

/**
 * Interface for validating access to data destinations
 * Implementations verify if the system can access the configured destination
 */
export interface DataDestinationAccessValidator extends TypedComponent<DataDestinationType> {
  /**
   * Validates access to a data destination
   *
   * @param destinationConfig - Configuration for the data destination
   * @param dataDestination - The data destination entity
   * @returns A validation result indicating success or failure with error details
   */
  validate(
    destinationConfig: DataDestinationConfig,
    dataDestination: DataDestination
  ): Promise<ValidationResult>;
}

/**
 * Result of a data destination access validation
 * Contains validation status and additional information
 */
export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly reason?: Record<string, unknown>,
    public readonly discoveredValues?: { spreadsheetTitle: string; sheetTitle: string }
  ) {}
}
