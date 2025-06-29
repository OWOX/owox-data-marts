import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../data-destination-credentials.type';

/**
 * Interface for validating credentials for data destinations
 * Implementations verify if the provided credentials are valid for the destination type
 */
export interface DataDestinationCredentialsValidator extends TypedComponent<DataDestinationType> {
  /**
   * Validates credentials for a data destination
   *
   * @param credentials - The credentials to validate
   * @returns A validation result indicating success or failure with error details
   */
  validate(credentials: DataDestinationCredentials): Promise<ValidationResult>;
}

/**
 * Result of a credentials validation
 * Contains validation status and error information
 */
export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly reason?: Record<string, unknown>
  ) {}
}
