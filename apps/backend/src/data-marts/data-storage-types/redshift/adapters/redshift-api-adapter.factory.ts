import { Injectable } from '@nestjs/common';
import { RedshiftApiAdapter } from './redshift-api.adapter';
import { RedshiftCredentials } from '../schemas/redshift-credentials.schema';
import { RedshiftConfig } from '../schemas/redshift-config.schema';

@Injectable()
export class RedshiftApiAdapterFactory {
  create(credentials: RedshiftCredentials, config: RedshiftConfig): RedshiftApiAdapter {
    return new RedshiftApiAdapter(credentials, config);
  }
}
