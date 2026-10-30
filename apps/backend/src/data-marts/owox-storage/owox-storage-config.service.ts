import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxStorageSettings, readOwoxStorageSettings } from './owox-storage-settings';

const ENV_NAMES = [
  'OWOX_STORAGE_ENGINE',
  'OWOX_STORAGE_GCP_PROJECT_ID',
  'OWOX_STORAGE_SERVICE_ACCOUNT_PROJECT_ID',
  'OWOX_STORAGE_FREE_QUERY_LIMIT_GIB_PER_DAY',
  'OWOX_STORAGE_PAID_QUERY_LIMIT_GIB_PER_DAY',
];

@Injectable()
export class OwoxStorageConfigService {
  private readonly settings: OwoxStorageSettings | null;

  constructor(configService: ConfigService) {
    this.settings = readOwoxStorageSettings(
      Object.fromEntries(ENV_NAMES.map(name => [name, configService.get<string>(name)]))
    );
  }

  isEnabled(): boolean {
    return this.settings !== null;
  }

  getSettings(): OwoxStorageSettings {
    if (!this.settings) {
      throw new BusinessViolationException('OWOX Storage is not available on this deployment.');
    }
    return this.settings;
  }
}
