import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppEditionConfig } from '../../common/config/app-edition-config.service';

@Injectable()
export class EeLicenseService {
  constructor(private readonly appEditionConfig: AppEditionConfig) {}

  isLicensed(): boolean {
    try {
      return this.appEditionConfig.isEnterpriseEdition();
    } catch {
      return false;
    }
  }

  verifyLicensed(): void {
    if (!this.isLicensed()) {
      throw new ForbiddenException('Enterprise license required');
    }
  }
}
