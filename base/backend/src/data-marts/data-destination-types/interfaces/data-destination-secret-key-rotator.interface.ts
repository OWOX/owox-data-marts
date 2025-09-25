import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../data-destination-credentials.type';

/**
 * Interface for rotating secret keys in data destination credentials
 */
export interface DataDestinationSecretKeyRotator extends TypedComponent<DataDestinationType> {
  /**
   * Rotates the secret key in the credentials
   *
   * @param credentials - The current credentials
   * @returns The credentials with rotated secret key
   */
  rotateSecretKey(credentials: DataDestinationCredentials): Promise<DataDestinationCredentials>;
}
