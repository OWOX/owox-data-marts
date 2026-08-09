import { Provider } from '@nestjs/common';
import { InternalProjectBillingService } from './internal-project-billing.service';
import { ProjectBillingService } from './project-billing.service';

export const projectBillingProvider: Provider = {
  provide: ProjectBillingService,
  useExisting: InternalProjectBillingService,
};
