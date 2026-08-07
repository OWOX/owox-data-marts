const EXPIRING_SOON_DAYS = 30;

export function isExpired(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() <= Date.now();
}

export function isExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return false;

  const diffDays = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  return diffDays > 0 && diffDays <= EXPIRING_SOON_DAYS;
}
