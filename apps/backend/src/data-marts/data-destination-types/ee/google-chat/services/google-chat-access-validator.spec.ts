import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { DestinationCredentialUnavailableException } from '../../../../exceptions/destination-credential-unavailable.exception';
import { GoogleChatAccessValidator } from './google-chat-access-validator';

describe('GoogleChatAccessValidator', () => {
  const config = {
    type: 'email-config' as const,
    subject: 'Weekly report',
    reportCondition: ReportCondition.ALWAYS,
    templateSource: {
      type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
      config: { messageTemplate: 'Insight' },
    },
  };

  it.each([
    {
      type: 'google-chat-credentials',
      webhookUrl: 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1',
    },
    { type: 'email-credentials', to: ['space@example.com'] },
  ])('accepts $type', async credentials => {
    const validator = new GoogleChatAccessValidator({
      resolveAuth: jest.fn().mockResolvedValue({ kind: 'unbound', credentials }),
    } as never);

    const result = await validator.validate(config, {} as never);

    expect(result.valid).toBe(true);
  });

  it('returns channel-email validation errors for invalid email credentials', async () => {
    const validator = new GoogleChatAccessValidator({
      resolveAuth: jest.fn().mockResolvedValue({
        kind: 'unbound',
        credentials: { type: 'email-credentials', to: [] },
      }),
    } as never);

    const result = await validator.validate(config, {} as never);
    const errors = result.reason?.errors as Array<{ path: Array<string | number> }>;

    expect(result.valid).toBe(false);
    expect(errors[0].path).toEqual(['to']);
  });

  it('reports an unbound Destination without a key as not configured', async () => {
    const validator = new GoogleChatAccessValidator({
      resolveAuth: jest.fn().mockResolvedValue({ kind: 'unbound', credentials: null }),
    } as never);

    const result = await validator.validate(config, {} as never);

    expect(result).toMatchObject({ valid: false, errorMessage: 'Credentials are not configured' });
  });

  it('accepts a bound webhook Credential without recording a use of it', async () => {
    const resolveAuth = jest.fn().mockResolvedValue({
      kind: 'webhook',
      credentials: {
        type: 'google-chat-credentials',
        webhookUrl: 'https://chat.googleapis.com/v1/spaces/space-1/messages?key=k&token=t',
      },
    });
    const validator = new GoogleChatAccessValidator({ resolveAuth } as never);
    const destination = { id: 'dest-1' };

    const result = await validator.validate(config, destination as never);

    expect(result.valid).toBe(true);
    expect(resolveAuth).toHaveBeenCalledWith(destination, { markUsed: false });
  });

  it("hands a bound Credential's error to the caller unchanged", async () => {
    const unavailable = new DestinationCredentialUnavailableException('Enable it.', false);
    const validator = new GoogleChatAccessValidator({
      resolveAuth: jest.fn().mockRejectedValue(unavailable),
    } as never);

    await expect(validator.validate(config, {} as never)).rejects.toBe(unavailable);
  });
});
