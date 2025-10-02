import { Injectable } from '@nestjs/common';
import { GoogleSheetsApiAdapter } from './google-sheets-api.adapter';
import { GoogleSheetsCredentials } from '../schemas/google-sheets-credentials.schema';

@Injectable()
export class GoogleSheetsApiAdapterFactory {
  create(credentials: GoogleSheetsCredentials): GoogleSheetsApiAdapter {
    return new GoogleSheetsApiAdapter(credentials);
  }
}
