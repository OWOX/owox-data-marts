export function splitName(name?: string): { firstName: string; lastName: string; fullName: string } {
  const cleaned = (name || '').trim();
  if (!cleaned) {
    return { firstName: '', lastName: '', fullName: '' };
  }
  const [firstName = '', ...rest] = cleaned.split(/\s+/);
  const lastName = rest.join(' ');
  return { firstName, lastName, fullName: cleaned };
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ''}`;
  }
  return String(error);
}
