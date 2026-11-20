export const MY_ACCOUNT_PREFIX = '/ui/me';
export const MY_ACCOUNT_PATH = `${MY_ACCOUNT_PREFIX}/profile`;
export const MY_ACCOUNT_PROJECTS_PATH = `${MY_ACCOUNT_PREFIX}/projects`;
export const MY_ACCOUNT_EMAIL_PATH = `${MY_ACCOUNT_PREFIX}/email-preferences`;

export function isMyAccountPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, '');
  return pathname === MY_ACCOUNT_PREFIX || pathname.startsWith(`${MY_ACCOUNT_PREFIX}/`);
}
