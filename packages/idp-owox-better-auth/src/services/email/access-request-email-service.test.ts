import { describe, expect, it, jest } from '@jest/globals';
import type { EmailProvider } from '@owox/internal-helpers';
import { AccessRequestEmailService } from './access-request-email-service.js';

type SendArgs = [
  string,
  string,
  string,
  { bodyText: string; categories: string[]; isMultiple?: boolean; signal?: AbortSignal },
];

function createService(retryDelaysMs: number[] = []) {
  const sendEmail = jest.fn<EmailProvider['sendEmail']>(async () => undefined);
  const provider = { sendEmail } as jest.Mocked<EmailProvider>;
  const service = new AccessRequestEmailService(provider, 'https://app.example.com/', {
    retryDelaysMs,
  });
  return { sendEmail, service };
}

describe('AccessRequestEmailService', () => {
  it('tells the admin who asked for which role in which project and links to the members page', async () => {
    const { sendEmail, service } = createService();

    await service.send({
      adminEmail: 'admin@example.com',
      requesterEmail: 'new@example.com',
      role: 'editor',
      projectId: 'p-1',
      projectTitle: 'Acme',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, options] = sendEmail.mock.calls[0] as SendArgs;
    expect(to).toBe('admin@example.com');
    expect(subject).toBe('Access request to Acme in OWOX Data Marts');
    expect(html).toContain('>Project Acme</div>');
    expect(html).toContain(
      'User new@example.com requested access to <strong>Acme</strong> as a <strong>Data Owner</strong>.'
    );
    expect(html).toContain('https://app.example.com/ui/p-1/project-settings/members');
    expect(options.isMultiple).toBe(false);
    expect(options.categories).toEqual(['transactional', 'project-access-request']);
    expect(options.bodyText).toContain(
      'User new@example.com requested access to Acme as a Data Owner.'
    );
    expect(options.bodyText).toContain(
      'Review request: https://app.example.com/ui/p-1/project-settings/members'
    );
  });

  it('uses UI role names', async () => {
    const { sendEmail, service } = createService();

    await service.send({ adminEmail: 'a@example.com', role: 'admin', projectId: 'p-1' });
    await service.send({ adminEmail: 'a@example.com', role: 'viewer', projectId: 'p-1' });

    expect((sendEmail.mock.calls[0] as SendArgs)[3].bodyText).toContain('as a Project Admin.');
    expect((sendEmail.mock.calls[1] as SendArgs)[3].bodyText).toContain('as a Business User.');
  });

  it('reads without a requester email or project title', async () => {
    const { sendEmail, service } = createService();

    await service.send({ adminEmail: 'admin@example.com', role: 'viewer', projectId: 'p-1' });

    const [, subject, , options] = sendEmail.mock.calls[0] as SendArgs;
    expect(subject).toBe('Access request to your project in OWOX Data Marts');
    expect(options.bodyText).toContain(
      'Someone requested access to your OWOX project as a Business User.'
    );
  });

  it('keeps project titles from turning into links and escapes HTML', async () => {
    const { sendEmail, service } = createService();

    await service.send({
      adminEmail: 'admin@example.com',
      requesterEmail: '<i>x</i>@example.com',
      role: 'viewer',
      projectId: 'p-1',
      projectTitle: 'shop.example.com <b>x</b>',
    });

    const [, subject, html] = sendEmail.mock.calls[0] as SendArgs;
    expect(subject).toBe('Access request to shop example com <b>x</b> in OWOX Data Marts');
    expect(html).toContain('<strong>shop example com &lt;b&gt;x&lt;/b&gt;</strong>');
    expect(html).toContain('User &lt;i&gt;x&lt;/i&gt;@example.com requested access');
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<i>x</i>');
  });

  it('retries a failed send and throws the last error when every attempt fails', async () => {
    const { sendEmail, service } = createService([0, 0]);
    sendEmail.mockRejectedValue(new Error('SendGrid responded 500'));

    await expect(
      service.send({ adminEmail: 'admin@example.com', role: 'viewer', projectId: 'p-1' })
    ).rejects.toThrow('SendGrid responded 500');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });
});
