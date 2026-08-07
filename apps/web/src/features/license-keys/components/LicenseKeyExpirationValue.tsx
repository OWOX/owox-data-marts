import { ExpirationValue } from '../../../shared/components/ExpirationValue/ExpirationValue';
import { LICENSE_KEY_EXPIRED_NOTICE, LICENSE_KEY_EXPIRING_SOON_NOTICE } from '../utils';

interface LicenseKeyExpirationValueProps {
  expiresAt: string;
  focusable?: boolean;
}

export function LicenseKeyExpirationValue({
  expiresAt,
  focusable,
}: LicenseKeyExpirationValueProps) {
  return (
    <ExpirationValue
      expiresAt={expiresAt}
      expiredNotice={LICENSE_KEY_EXPIRED_NOTICE}
      expiringSoonNotice={LICENSE_KEY_EXPIRING_SOON_NOTICE}
      focusable={focusable}
    />
  );
}
