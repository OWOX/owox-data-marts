import { Injectable } from '@nestjs/common';
import {
  DataDestinationCredentialsPublic,
  GoogleSheetsOAuthCredentialsPublic,
} from '../dto/presentation/data-destination-response-api.dto';
import { DataDestinationCredentials } from './data-destination-credentials.type';
import { DataDestinationType } from './enums/data-destination-type.enum';
import { DataDestinationPublicCredentialsFactory } from './factories/data-destination-public-credentials.factory';

@Injectable()
export class DataDestinationCredentialsUtils {
  constructor(private readonly factory: DataDestinationPublicCredentialsFactory) {}

  getPublicCredentials(
    type: DataDestinationType,
    credentials: DataDestinationCredentials | undefined
  ): DataDestinationCredentialsPublic | GoogleSheetsOAuthCredentialsPublic | undefined {
    if (!credentials) return undefined;

    return this.factory.create(type, credentials);
  }
}
