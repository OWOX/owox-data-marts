import { Injectable } from '@nestjs/common';
import {
  DataDestinationCredentialsPublic,
  GoogleSheetsOAuthCredentialsPublic,
} from '../../dto/presentation/data-destination-response-api.dto';
import {
  DataDestinationCredentials,
  DataDestinationCredentialsSchema,
} from '../data-destination-credentials.type';
import { DataDestinationType } from '../enums/data-destination-type.enum';
import { GoogleSheetsCredentialsType } from '../google-sheets/schemas/google-sheets-credentials.schema';

@Injectable()
export class DataDestinationPublicCredentialsFactory {
  create(
    type: DataDestinationType,
    credentials: DataDestinationCredentials
  ): DataDestinationCredentialsPublic | GoogleSheetsOAuthCredentialsPublic | undefined {
    if (!credentials) {
      throw new Error(`Credentials are required for destination type: ${type}`);
    }

    const validatedCredentials = DataDestinationCredentialsSchema.parse(credentials);

    switch (validatedCredentials.type) {
      case GoogleSheetsCredentialsType: {
        if (!validatedCredentials.serviceAccountKey) {
          return { type: 'google-sheets-oauth-credentials' as const };
        }
        return {
          type: 'google-sheets-credentials',
          serviceAccountKey: {
            type: 'service_account',
            project_id: validatedCredentials.serviceAccountKey.project_id,
            client_email: validatedCredentials.serviceAccountKey.client_email,
            client_id: validatedCredentials.serviceAccountKey.client_id,
          },
        };
      }

      default: {
        return undefined;
      }
    }
  }
}
