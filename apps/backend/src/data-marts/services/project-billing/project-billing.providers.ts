import { Provider } from '@nestjs/common';
import {
  AppEditionConfig,
  ProjectBinding,
} from '../../../common/config/app-edition-config.service';
import { InternalProjectBilling } from './internal-project-billing.service';
import { LicenseProjectBilling } from './license-project-billing.service';
import { PROJECT_BILLING, ProjectBilling } from './project-billing';
import { RestrictedProjectBilling } from './restricted-project-billing.service';

export const projectBillingProvider: Provider = {
  provide: PROJECT_BILLING,
  useFactory: (
    appEditionConfig: AppEditionConfig,
    internal: InternalProjectBilling,
    license: LicenseProjectBilling,
    restricted: RestrictedProjectBilling
  ): ProjectBilling => {
    const binding = appEditionConfig.getLicenseContext()?.binding;

    if (binding === ProjectBinding.INTERNAL) {
      if (!internal.isBalanceConfigured()) {
        throw new Error(
          'A CLOUD_BILLED_ENTERPRISE license with INTERNAL binding requires a complete balance integration. ' +
            'Set BALANCE_ENDPOINT_BASE_URL, BALANCE_ENDPOINT_AUTH_SERVICE_ACCOUNT and BALANCE_ENDPOINT_TARGET_AUDIENCE.'
        );
      }
      return internal;
    }

    return binding === ProjectBinding.LICENSE ? license : restricted;
  },
  inject: [
    AppEditionConfig,
    InternalProjectBilling,
    LicenseProjectBilling,
    RestrictedProjectBilling,
  ],
};
