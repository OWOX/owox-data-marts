import { describe, expect, it, jest } from '@jest/globals';
import type { EmailProvider } from '@owox/internal-helpers';
import { MagicLinkEmailService } from './magic-link-email-service.js';

describe('MagicLinkEmailService', () => {
  it('sends signup email with confirmation subject and content', async () => {
    const emailProvider: jest.Mocked<EmailProvider> = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MagicLinkEmailService(emailProvider);

    await service.send({
      email: 'user@example.com',
      magicLink: 'https://auth.example.com/auth/magic-link?token=t1',
      intent: 'signup',
    });

    expect(emailProvider.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = emailProvider.sendEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe('user@example.com');
    expect(subject).toBe('Confirm your email');
    expect(html).toContain('Confirm your email');
    expect(html).toContain('Confirm email');
    expect(html).toContain('https://auth.example.com/auth/magic-link?token=t1');
  });

  it('sends reset email with reset subject and content', async () => {
    const emailProvider: jest.Mocked<EmailProvider> = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MagicLinkEmailService(emailProvider);

    await service.send({
      email: 'user@example.com',
      magicLink: 'https://auth.example.com/auth/magic-link?token=t2',
      intent: 'reset',
    });

    expect(emailProvider.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = emailProvider.sendEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe('user@example.com');
    expect(subject).toBe('Reset your password');
    expect(html).toContain('Reset your password');
    expect(html).toContain('Reset password');
    expect(html).toContain('https://auth.example.com/auth/magic-link?token=t2');
  });
});
