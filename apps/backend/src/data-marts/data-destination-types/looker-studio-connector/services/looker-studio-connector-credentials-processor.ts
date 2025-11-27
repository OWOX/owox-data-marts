import { Injectable } from '@nestjs/common';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { DataDestinationCredentials } from '../../data-destination-credentials.type';
import { DataDestinationCredentialsProcessor } from '../../interfaces/data-destination-credentials-processor.interface';
import {
  LookerStudioConnectorCredentialsSchema,
  LookerStudioConnectorCredentials,
} from '../schemas/looker-studio-connector-credentials.schema';
import * as crypto from 'crypto';

/**
 * Processor for LookerStudio connector credentials
 * Manages backend-controlled fields (destinationId, destinationSecretKey)
 * while allowing user control over deploymentUrl
 */
@Injectable()
export class LookerStudioConnectorCredentialsProcessor implements DataDestinationCredentialsProcessor {
  readonly type = DataDestinationType.LOOKER_STUDIO;

  /**
   * Processes LookerStudio credentials by preserving or generating backend-managed fields
   *
   * @param inputCredentials - User-provided credentials (typically only deploymentUrl)
   * @param existingCredentials - Existing credentials for updates (preserves backend fields)
   * @returns Processed credentials with all required fields
   */
  async processCredentials(
    inputCredentials: DataDestinationCredentials,
    existingCredentials?: DataDestinationCredentials
  ): Promise<DataDestinationCredentials> {
    const parsed = LookerStudioConnectorCredentialsSchema.parse(inputCredentials);
    const existingLookerCredentials = existingCredentials as
      | LookerStudioConnectorCredentials
      | undefined;
    const destinationSecretKey =
      existingLookerCredentials?.destinationSecretKey || this.generateSecretKey();

    return {
      ...parsed,
      destinationSecretKey,
    };
  }

  /**
   * Generates a secure secret key for the destination
   * Uses crypto.randomBytes for cryptographic security
   */
  private generateSecretKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
