import { Injectable, Logger } from '@nestjs/common';
import { DataDestinationCredentials } from './data-destination-credentials.type';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestination } from '../entities/data-destination.entity';

@Injectable()
export class DataDestinationCredentialsResolver {
  private readonly logger = new Logger(DataDestinationCredentialsResolver.name);

  constructor(
    private readonly dataDestinationCredentialService: DataDestinationCredentialService
  ) {}

  async resolve(destination: DataDestination): Promise<DataDestinationCredentials> {
    if (destination.credentialId) {
      const credential = await this.dataDestinationCredentialService.getById(
        destination.credentialId
      );
      if (!credential) {
        this.logger.error(`Credential record not found: ${destination.credentialId}`);
        throw new Error(`Credential record not found: ${destination.credentialId}`);
      }

      return credential.credentials as DataDestinationCredentials;
    }

    throw new Error('Destination credentials are not configured');
  }
}
