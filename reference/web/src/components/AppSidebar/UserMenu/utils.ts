export function generateInitials(fullName?: string | null, email?: string | null): string {
  if (fullName) {
    const names = fullName.trim().split(' ').filter(Boolean);
    if (names.length >= 2) {
      return `${names[0]?.[0] ?? ''}${names[1]?.[0] ?? ''}`.toUpperCase();
    }
    return names[0]?.[0]?.toUpperCase() || '';
  }

  if (email?.includes('@')) {
    const emailPart = email.split('@')[0];
    return emailPart.length > 1
      ? `${emailPart[0]}${emailPart[1]}`.toUpperCase()
      : emailPart[0].toUpperCase();
  }

  return 'U';
}
