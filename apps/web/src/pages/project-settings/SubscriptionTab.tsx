import { BriefcaseBusiness } from 'lucide-react';
import { ExternalPlatformTab } from './ExternalPlatformTab';

export function SubscriptionTab() {
  return (
    <ExternalPlatformTab
      name='project-subscription'
      title='Subscription'
      tooltip='Project subscription plan'
      icon={BriefcaseBusiness}
      description="We're bringing subscription management into this page soon. In the meantime, view or change your plan on the legacy platform."
      href='https://platform.owox.com/ui/p/none/settings/subscription'
      cta='Open legacy subscription'
    />
  );
}
