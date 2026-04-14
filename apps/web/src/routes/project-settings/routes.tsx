import type { RouteObject } from 'react-router-dom';
import { MembersTab } from '../../pages/project-settings/MembersTab';
import { ContextsTab } from '../../pages/project-settings/ContextsTab';
import { OverviewTab } from '../../pages/project-settings/OverviewTab';
import { CreditConsumptionTab } from '../../pages/project-settings/CreditConsumptionTab';
import { SubscriptionTab } from '../../pages/project-settings/SubscriptionTab';
import { NotificationSettingsTab } from '../../pages/project-settings/NotificationSettingsTab';
import { LayoutErrorBoundary } from '../../components/errors';

export const projectSettingsRoutes: RouteObject[] = [
  {
    index: true,
    element: <OverviewTab />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'members',
    element: <MembersTab />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'contexts',
    element: <ContextsTab />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'credit',
    element: <CreditConsumptionTab />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'subscription',
    element: <SubscriptionTab />,
    errorElement: <LayoutErrorBoundary />,
  },
  {
    path: 'notifications',
    element: <NotificationSettingsTab />,
    errorElement: <LayoutErrorBoundary />,
  },
];
