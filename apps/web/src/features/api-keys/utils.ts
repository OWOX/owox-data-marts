export const API_KEY_EXPIRING_SOON_NOTICE = 'This API key expires within 30 days.';
export const API_KEY_EXPIRING_SOON_CLASS_NAME = 'font-medium text-amber-600';

export function isApiKeyExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > 0 && diffDays <= 30;
}
