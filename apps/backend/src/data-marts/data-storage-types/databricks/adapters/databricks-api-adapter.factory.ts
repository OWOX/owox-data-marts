import { Injectable } from '@nestjs/common';
import { DatabricksApiAdapter } from './databricks-api.adapter';
import { DatabricksCredentials } from '../schemas/databricks-credentials.schema';
import { DatabricksConfig } from '../schemas/databricks-config.schema';

@Injectable()
export class DatabricksApiAdapterFactory {
  create(credentials: DatabricksCredentials, config: DatabricksConfig): DatabricksApiAdapter {
    return new DatabricksApiAdapter(credentials, config);
  }
}
