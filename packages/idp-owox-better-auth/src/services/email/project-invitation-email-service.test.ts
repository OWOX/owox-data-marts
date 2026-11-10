import { describe, expect, it, jest } from '@jest/globals';
import type { EmailProvider } from '@owox/internal-helpers';
import { ProjectInvitationEmailService } from './project-invitation-email-service.js';

const NO_RETRIES = { retryDelaysMs: [] };

type SendArgs = [
  string,
  string,
  string,
  { bodyText: string; categories: string[]; signal?: AbortSignal },
];

function createProvider() {
  const sendEmail = jest.fn<EmailProvider['sendEmail']>(async () => undefined);
  return { sendEmail, provider: { sendEmail } as jest.Mocked<EmailProvider> };
}

describe('ProjectInvitationEmailService', () => {
  it('sends the invitation with project, inviter, role name and project link', async () => {
    const { sendEmail, provider } = createProvider();
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com/', {
      retryDelaysMs: [],
    });

    await service.send({
      email: 'new@example.com',
      role: 'editor',
      projectId: 'p-1',
      projectTitle: 'Acme',
      inviterEmail: 'admin@example.com',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, options] = sendEmail.mock.calls[0] as SendArgs;
    expect(to).toBe('new@example.com');
    expect(subject).toBe("You're invited to Acme in OWOX Data Marts");
    expect(html).toContain('Hey friend');
    expect(html).toContain('>Project Acme</div>');
    expect(html).toContain(
      'You have been invited by user admin@example.com to join <strong>Acme</strong> as a <strong>Data Owner</strong>.'
    );
    expect(html).toContain('Accept invitation');
    expect(html).toContain('https://app.example.com/ui/p-1/data-marts');
    expect(options.categories).toEqual(['transactional', 'project-invitation']);
    expect(options.bodyText).toBe(
      [
        'Hey friend',
        '',
        'You have been invited by user admin@example.com to join Acme as a Data Owner.',
        '',
        'Accept invitation: https://app.example.com/ui/p-1/data-marts',
        '',
        "If you weren't expecting this invitation, you can ignore this email.",
      ].join('\n')
    );
  });

  it('uses UI role names', async () => {
    const { sendEmail, provider } = createProvider();
    const service = new ProjectInvitationEmailService(
      provider,
      'https://app.example.com',
      NO_RETRIES
    );

    await service.send({ email: 'a@example.com', role: 'admin', projectId: 'p-1' });
    await service.send({ email: 'b@example.com', role: 'viewer', projectId: 'p-1' });

    expect((sendEmail.mock.calls[0] as SendArgs)[3].bodyText).toContain('as a Project Admin.');
    expect((sendEmail.mock.calls[1] as SendArgs)[3].bodyText).toContain('as a Business User.');
  });

  it('reads without a project title or inviter', async () => {
    const { sendEmail, provider } = createProvider();
    const service = new ProjectInvitationEmailService(
      provider,
      'https://app.example.com',
      NO_RETRIES
    );

    await service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' });

    const [, subject, , options] = sendEmail.mock.calls[0] as SendArgs;
    expect(subject).toBe("You're invited to a project in OWOX Data Marts");
    expect(options.bodyText).toContain(
      'You have been invited to join the OWOX project as a Business User.'
    );
  });

  it('keeps project titles from turning into links and escapes HTML', async () => {
    const { sendEmail, provider } = createProvider();
    const service = new ProjectInvitationEmailService(
      provider,
      'https://app.example.com',
      NO_RETRIES
    );

    await service.send({
      email: 'new@example.com',
      role: 'viewer',
      projectId: 'p-1',
      projectTitle: 'shop.example.com <b>x</b>',
    });

    const [, subject, html] = sendEmail.mock.calls[0] as SendArgs;
    expect(subject).toBe("You're invited to shop example com <b>x</b> in OWOX Data Marts");
    expect(html).toContain('<strong>shop example com &lt;b&gt;x&lt;/b&gt;</strong>');
    expect(html).toContain('>Project shop example com &lt;b&gt;x&lt;/b&gt;</div>');
    expect(html).not.toContain('<b>x</b>');
  });

  it('retries a failed send', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockRejectedValueOnce(new Error('SendGrid network error'));
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0],
    });

    await service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' });

    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('gives every attempt its own time limit', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockRejectedValueOnce(new Error('SendGrid network error: TimeoutError'));
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0],
      attemptTimeoutMs: 50,
    });

    await service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' });

    const signals = sendEmail.mock.calls.map(call => (call as SendArgs)[3].signal);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).not.toBe(signals[0]);
  });

  it('throws the last error when every attempt fails', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockRejectedValue(new Error('SendGrid responded 500'));
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0, 0],
    });

    await expect(
      service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' })
    ).rejects.toThrow('SendGrid responded 500');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
});
