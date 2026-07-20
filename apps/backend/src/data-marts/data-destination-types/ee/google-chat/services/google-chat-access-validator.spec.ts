import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
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
      resolve: jest.fn().mockResolvedValue(credentials),
    } as never);

    const result = await validator.validate(config, {} as never);

    expect(result.valid).toBe(true);
  });
});
