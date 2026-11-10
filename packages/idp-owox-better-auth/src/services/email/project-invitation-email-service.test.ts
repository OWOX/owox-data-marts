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

/** A send that never answers; it fails like the SendGrid provider once its signal aborts. */
function hangUntilAborted(
  ...[, , , options]: Parameters<EmailProvider['sendEmail']>
): Promise<void> {
  return new Promise((_, reject) => {
    options?.signal?.addEventListener('abort', () => {
      reject(
        new Error(`SendGrid network error: ${String((options.signal?.reason as Error).message)}`)
      );
    });
  });
}

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

  it('aborts an attempt that runs out of time and tries again', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockImplementationOnce(hangUntilAborted);
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0],
      attemptTimeoutMs: 20,
    });

    await service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' });

    const [first, second] = sendEmail.mock.calls.map(call => (call as SendArgs)[3].signal);
    expect(first?.aborted).toBe(true);
    expect(second?.aborted).toBe(false);
  });

  it('by default allows 5 s per attempt and stops retrying after 12 s in total', async () => {
    jest.useFakeTimers();
    try {
      const { sendEmail, provider } = createProvider();
      sendEmail.mockImplementation(hangUntilAborted);
      const service = new ProjectInvitationEmailService(provider, 'https://app.example.com');
      const outcome = service
        .send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' })
        .then(
          () => 'sent',
          (error: unknown) => (error as Error).message
        );

      await jest.advanceTimersByTimeAsync(4999);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1 + 500);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      // The second attempt ends at 10.5 s; a 1.5 s pause would reach the 12 s limit.
      await jest.advanceTimersByTimeAsync(5000);
      expect(await outcome).toContain('timeout');
      expect(sendEmail).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry an error that a retry cannot fix', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockRejectedValue(new Error('SendGrid responded 401 Unauthorized: invalid key'));
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0, 0],
    });

    await expect(
      service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' })
    ).rejects.toThrow('401');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('throws the last error when every attempt fails', async () => {
    const { sendEmail, provider } = createProvider();
    sendEmail.mockRejectedValue(new Error('SendGrid responded 503 Service Unavailable'));
    const service = new ProjectInvitationEmailService(provider, 'https://app.example.com', {
      retryDelaysMs: [0, 0],
    });

    await expect(
      service.send({ email: 'new@example.com', role: 'viewer', projectId: 'p-1' })
    ).rejects.toThrow('SendGrid responded 503');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
});
