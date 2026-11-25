import { Bell, BriefcaseBusiness, Gem, Settings, ShieldCheck, Tags, Users } from 'lucide-react';
import { getCloudBillingOrigin } from '../cloud-billing/cloud-billing';
import { checkVisible } from '../../utils/check-visible';

export function getProjectSettingsTabs(flags: Record<string, unknown> | null) {
  const showBilling =
    getCloudBillingOrigin(flags) !== null ||
    checkVisible('IDP_PROVIDER', 'owox-better-auth', flags);
  const showLicenseKeys = checkVisible('LICENSE_ISSUANCE_ENABLED', 'true', flags);

  return [
    { name: 'Overview', path: '.', icon: Settings },
    { name: 'Members', path: 'members', icon: Users },
    { name: 'Contexts', path: 'contexts', icon: Tags },
    ...(showBilling
      ? [
          { name: 'Credit consumption', path: 'credit', icon: Gem },
          { name: 'Subscription', path: 'subscription', icon: BriefcaseBusiness },
        ]
      : []),
    ...(showLicenseKeys ? [{ name: 'License keys', path: 'license-keys', icon: ShieldCheck }] : []),
    { name: 'Notifications', path: 'notifications', icon: Bell },
  ];
}
