import { describe, expect, it, jest } from '@jest/globals';
import type { EmailProvider } from '@owox/internal-helpers';
import { AccessRequestEmailService } from './access-request-email-service.js';

type SendArgs = [
  string,
  string,
  string,
  { bodyText: string; categories: string[]; isMultiple?: boolean; signal?: AbortSignal },
];

const MEMBERS_URL = 'https://app.example.com/ui/p-1/project-settings/members';

function createService(retryDelaysMs: number[] = []) {
  const sendEmail = jest.fn<EmailProvider['sendEmail']>(async () => undefined);
  const provider = { sendEmail } as jest.Mocked<EmailProvider>;
  const service = new AccessRequestEmailService(provider, 'https://app.example.com/', {
    retryDelaysMs,
  });
  return { sendEmail, service };
}

describe('AccessRequestEmailService.sendRequestToAdmin', () => {
  it('keeps the wording admins received before and links to the members page', async () => {
    const { sendEmail, service } = createService();

    await service.sendRequestToAdmin({
      adminEmail: 'admin@example.com',
      requesterEmail: 'new@example.com',
      role: 'editor',
      projectId: 'p-1',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, options] = sendEmail.mock.calls[0] as SendArgs;
    expect(to).toBe('admin@example.com');
    expect(subject).toBe('You have a new access request');
    expect(html).toContain('Hey friend');
    expect(html).toContain('>from new@example.com</div>');
    expect(html).toContain(
      'The user with the email new@example.com has requested a change in permissions for your project to the role of <strong>Data Owner</strong>.'
    );
    expect(html).toContain(
      `Kindly navigate to the <a href="${MEMBERS_URL}" target="_blank" rel="noopener noreferrer" style="color:#1E88E5;text-decoration:none;">Members</a> page in your project to review and approve this request.`
    );
    expect(html).toContain('Check request');
    expect(html).toContain(`href="${MEMBERS_URL}"`);
    expect(options.isMultiple).toBe(false);
    expect(options.categories).toEqual(['transactional', 'project-access-request']);
    expect(options.bodyText).toBe(
      [
        'Hey friend',
        '',
        'The user with the email new@example.com has requested a change in permissions for your project to the role of Data Owner.',
        '',
        'Kindly navigate to the Members page in your project to review and approve this request.',
        '',
        `Check request: ${MEMBERS_URL}`,
        '',
        'You received this email because you are an admin of this project.',
      ].join('\n')
    );
  });

  it('uses UI role names', async () => {
    const { sendEmail, service } = createService();

    await service.sendRequestToAdmin({
      adminEmail: 'a@example.com',
      role: 'admin',
      projectId: 'p',
    });
    await service.sendRequestToAdmin({
      adminEmail: 'a@example.com',
      role: 'viewer',
      projectId: 'p',
    });

    expect((sendEmail.mock.calls[0] as SendArgs)[3].bodyText).toContain(
      'to the role of Project Admin.'
    );
    expect((sendEmail.mock.calls[1] as SendArgs)[3].bodyText).toContain(
      'to the role of Business User.'
    );
  });

  it('reads without the requester email', async () => {
    const { sendEmail, service } = createService();

    await service.sendRequestToAdmin({
      adminEmail: 'admin@example.com',
      role: 'viewer',
      projectId: 'p-1',
    });

    const [, , html, options] = sendEmail.mock.calls[0] as SendArgs;
    expect(options.bodyText).toContain(
      'A user has requested a change in permissions for your project to the role of Business User.'
    );
    expect(html).not.toContain('>from ');
  });

  it('escapes HTML in the requester email', async () => {
    const { sendEmail, service } = createService();

    await service.sendRequestToAdmin({
      adminEmail: 'admin@example.com',
      requesterEmail: '<i>x</i>@example.com',
      role: 'viewer',
      projectId: 'p-1',
    });

    const [, , html] = sendEmail.mock.calls[0] as SendArgs;
    expect(html).toContain(
      'The user with the email &lt;i&gt;x&lt;/i&gt;@example.com has requested'
    );
    expect(html).toContain('>from &lt;i&gt;x&lt;/i&gt;@example.com</div>');
    expect(html).not.toContain('<i>x</i>');
  });

  it('gives each attempt 15 s, since nothing waits for the email', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    const { service } = createService();

    try {
      await service.sendRequestToAdmin({
        adminEmail: 'admin@example.com',
        role: 'viewer',
        projectId: 'p',
      });

      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it('retries a failed send and throws the last error when every attempt fails', async () => {
    const { sendEmail, service } = createService([0, 0]);
    sendEmail.mockRejectedValue(new Error('SendGrid responded 500'));

    await expect(
      service.sendRequestToAdmin({
        adminEmail: 'admin@example.com',
        role: 'viewer',
        projectId: 'p',
      })
    ).rejects.toThrow('SendGrid responded 500');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
});

describe('AccessRequestEmailService.sendApprovalToRequester', () => {
  it('keeps the wording people received before and opens the project', async () => {
    const { sendEmail, service } = createService();

    await service.sendApprovalToRequester({
      requesterEmail: 'new@example.com',
      role: 'viewer',
      projectId: 'p-1',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, options] = sendEmail.mock.calls[0] as SendArgs;
    expect(to).toBe('new@example.com');
    expect(subject).toBe('OWOX Project access is confirmed');
    expect(html).toContain('Hey friend');
    expect(html).toContain(
      'You have been granted <strong>Business User</strong> access to the OWOX project.'
    );
    expect(html).toContain('To access the project page, please click the link below.');
    expect(html).toContain('Join now');
    expect(html).toContain('href="https://app.example.com/ui/p-1/data-marts"');
    expect(options.categories).toEqual(['transactional', 'project-access-approved']);
    expect(options.bodyText).toBe(
      [
        'Hey friend',
        '',
        'You have been granted Business User access to the OWOX project.',
        '',
        'To access the project page, please click the link below.',
        '',
        'Join now: https://app.example.com/ui/p-1/data-marts',
        '',
        'You received this email because you asked for access to this project.',
      ].join('\n')
    );
  });
});
