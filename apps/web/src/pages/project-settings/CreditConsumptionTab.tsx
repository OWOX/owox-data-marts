import { Gem } from 'lucide-react';
import { ExternalPlatformTab } from './ExternalPlatformTab';

export function CreditConsumptionTab() {
  return (
    <ExternalPlatformTab
      name='project-credit-consumption'
      title='Credit consumption'
      tooltip='Project credit usage dashboards'
      icon={Gem}
      description="We're bringing credit consumption dashboards into this page soon. In the meantime, view and manage usage for this project on the legacy platform."
      href='https://platform.owox.com/ui/p/none/settings/consumption'
      cta='Open legacy consumption'
    />
  );
}
