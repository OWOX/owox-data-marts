import { Injectable } from '@nestjs/common';
import { DataDestinationCredentials } from './data-destination-credentials.type';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestination } from '../entities/data-destination.entity';

@Injectable()
export class DataDestinationCredentialsResolver {
  constructor(
    private readonly dataDestinationCredentialService: DataDestinationCredentialService
  ) {}

  async resolve(destination: DataDestination): Promise<DataDestinationCredentials> {
    // Use loaded relation if available, otherwise fall back to getById
    const credential =
      destination.credential ??
      (destination.credentialId
        ? await this.dataDestinationCredentialService.getById(destination.credentialId)
        : null);

    if (!credential) {
      throw new Error('Destination credentials are not configured');
    }

    return credential.credentials as DataDestinationCredentials;
  }
}
