export const MY_ACCOUNT_PREFIX = '/ui/me';
export const MY_ACCOUNT_PATH = `${MY_ACCOUNT_PREFIX}/profile`;
export const MY_ACCOUNT_PROJECTS_PATH = `${MY_ACCOUNT_PREFIX}/projects`;
export const MY_ACCOUNT_EMAIL_PATH = `${MY_ACCOUNT_PREFIX}/email-preferences`;

const accountPaths = [
  MY_ACCOUNT_PREFIX,
  MY_ACCOUNT_PATH,
  MY_ACCOUNT_PROJECTS_PATH,
  MY_ACCOUNT_EMAIL_PATH,
];

export function isMyAccountPath(path: string): boolean {
  return accountPaths.includes(path.toLowerCase().replace(/\/+$/, ''));
}
