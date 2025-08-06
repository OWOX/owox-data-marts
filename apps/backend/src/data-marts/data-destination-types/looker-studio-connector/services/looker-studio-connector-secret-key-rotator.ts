import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-credentials.type';
import { DataDestinationSecretKeyRotator } from '../../interfaces/data-destination-secret-key-rotator.interface';
import {
  LookerStudioConnectorCredentialsSchema,
  LookerStudioConnectorCredentials,
} from '../schemas/looker-studio-connector-credentials.schema';

/**
 * Secret key rotator for LookerStudio connector
 */
@Injectable()
export class LookerStudioConnectorSecretKeyRotator implements DataDestinationSecretKeyRotator {
  readonly type = DataDestinationType.LOOKER_STUDIO;

  /**
   * Rotates the secret key for LookerStudio connector
   *
   * @param credentials - Current LookerStudio credentials
   * @returns Credentials with new secret key
   */
  async rotateSecretKey(
    credentials: DataDestinationCredentials
  ): Promise<DataDestinationCredentials> {
    const parsed = LookerStudioConnectorCredentialsSchema.parse(credentials);

    return {
      ...parsed,
      destinationSecretKey: this.generateSecretKey(),
    } as LookerStudioConnectorCredentials;
  }

  /**
   * Generates a secure secret key
   */
  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
