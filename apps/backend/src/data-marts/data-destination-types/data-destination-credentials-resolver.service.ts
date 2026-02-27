import { Injectable } from '@nestjs/common';
import { DataDestinationCredentials } from './data-destination-credentials.type';
import { DataDestination } from '../entities/data-destination.entity';

@Injectable()
export class DataDestinationCredentialsResolver {
  async resolve(destination: DataDestination): Promise<DataDestinationCredentials> {
    const credential = destination.credential;

    if (!credential) {
      throw new Error('Destination credentials are not configured');
    }

    return credential.credentials as DataDestinationCredentials;
  }
}
