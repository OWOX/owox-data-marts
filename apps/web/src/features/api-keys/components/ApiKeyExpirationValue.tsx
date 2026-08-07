import { ExpirationValue } from '../../../shared/components/ExpirationValue/ExpirationValue';
import { API_KEY_EXPIRED_NOTICE, API_KEY_EXPIRING_SOON_NOTICE } from '../utils';

interface ApiKeyExpirationValueProps {
  expiresAt: string | null | undefined;
  focusable?: boolean;
}

export function ApiKeyExpirationValue({ expiresAt, focusable }: ApiKeyExpirationValueProps) {
  return (
    <ExpirationValue
      expiresAt={expiresAt}
      expiredNotice={API_KEY_EXPIRED_NOTICE}
      expiringSoonNotice={API_KEY_EXPIRING_SOON_NOTICE}
      focusable={focusable}
    />
  );
}
