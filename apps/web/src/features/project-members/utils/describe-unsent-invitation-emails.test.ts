import { describe, expect, it } from 'vitest';
import { describeUnsentInvitationEmails } from './describe-unsent-invitation-emails';

describe('describeUnsentInvitationEmails', () => {
  it('names the one person who did not get the email', () => {
    expect(describeUnsentInvitationEmails(['a@example.com'])).toBe(
      'a@example.com was invited, but the invitation email could not be sent. Please let them know yourself.'
    );
  });

  it('lists everyone who did not get the email', () => {
    expect(describeUnsentInvitationEmails(['a@example.com', 'b@example.com'])).toBe(
      'These teammates were invited, but their invitation emails could not be sent: a@example.com, b@example.com. Please let them know yourself.'
    );
  });
});
