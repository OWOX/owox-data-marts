import { Provider } from '@nestjs/common';
import { InternalProjectBilling } from './internal-project-billing.service';
import { PROJECT_BILLING } from './project-billing';

export const projectBillingProvider: Provider = {
  provide: PROJECT_BILLING,
  useExisting: InternalProjectBilling,
};
