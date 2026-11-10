/**
 * Notice for people who were invited but did not get the invitation email,
 * so the admin knows to tell them.
 */
export function describeUnsentInvitationEmails(emails: readonly string[]): string {
  if (emails.length === 1) {
    return `${emails[0] ?? ''} was invited, but the invitation email could not be sent. Please let them know yourself.`;
  }
  return `These teammates were invited, but their invitation emails could not be sent: ${emails.join(', ')}. Please let them know yourself.`;
}
