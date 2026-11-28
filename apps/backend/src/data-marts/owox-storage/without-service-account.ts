/** Google errors can name the account that an OWOX Storage runs as; logs and responses must not. */
export function withoutServiceAccount(message: string): string {
  return message.replace(/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/g, '<service account>');
}
