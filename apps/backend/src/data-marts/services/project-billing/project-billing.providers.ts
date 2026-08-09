import { Provider } from '@nestjs/common';
import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { BindingAwareProjectBillingService } from './binding-aware-project-billing.service';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { LicenseProjectBillingService } from './license-project-billing.service';
import { ProjectBillingService } from './project-billing.service';
import { RestrictedProjectBillingService } from './restricted-project-billing.service';

export const projectBillingProvider: Provider = {
  provide: ProjectBillingService,
  useFactory: (
    appEditionConfig: AppEditionConfig,
    internal: InternalProjectBillingService,
    license: LicenseProjectBillingService,
    restricted: RestrictedProjectBillingService
  ): ProjectBillingService => {
    const binding = appEditionConfig.getLicenseContext()?.binding;
    if (binding === ProjectBinding.INTERNAL && !internal.isBalanceConfigured()) {
      throw new Error(
        'A CLOUD_BILLED_ENTERPRISE license with INTERNAL binding requires a complete balance integration. ' +
          'Set BALANCE_ENDPOINT_BASE_URL, BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT and BALANCE_ENDPOINT_TARGET_AUDIENCE.'
      );
    }

    return new BindingAwareProjectBillingService(appEditionConfig, internal, license, restricted);
  },
  inject: [
    AppEditionConfig,
    InternalProjectBillingService,
    LicenseProjectBillingService,
    RestrictedProjectBillingService,
  ],
};
