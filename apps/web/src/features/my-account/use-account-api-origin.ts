import { useFlags } from '../../app/store/hooks';

export function useAccountApiOrigin(): string | null {
  const { flags } = useFlags();
  return getAccountApiOrigin(flags);
}

export function getAccountApiOrigin(flags?: Record<string, unknown> | null): string | null {
  const origin = flags?.CLOUD_ACCOUNT_API_ORIGIN;
  if (flags?.IDP_PROVIDER !== 'owox-better-auth' || typeof origin !== 'string') return null;

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && origin === url.origin ? origin : null;
  } catch {
    return null;
  }
}
