import { Navigate, useParams } from 'react-router';
import { AppPricing } from '../../features/cloud-billing/AppPricing';
import { AppCheckoutResult } from '../../features/cloud-billing/AppCheckoutResult';
import { useProjectRoute } from '../../shared/hooks';
import { CloudBillingTab } from './CloudBillingTab';

export function PricingPage() {
  const { projectId } = useParams();
  const project = useProjectRoute();
  return (
    <CloudBillingTab
      fallback={<Navigate to={project.scope('/project-settings/subscription')} replace />}
    >
      {origin => <AppPricing key={projectId} origin={origin} />}
    </CloudBillingTab>
  );
}

export function CheckoutResultPage() {
  const project = useProjectRoute();
  return (
    <CloudBillingTab
      fallback={<Navigate to={project.scope('/project-settings/subscription')} replace />}
    >
      {origin => <AppCheckoutResult origin={origin} />}
    </CloudBillingTab>
  );
}
