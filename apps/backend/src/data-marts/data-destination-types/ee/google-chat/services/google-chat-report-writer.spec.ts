import { DataMartInsightTemplateStatus } from '../../../../ai-insights/data-mart-insights.types';
import { ReportDataDescription } from '../../../../dto/domain/report-data-description.dto';
import type { Report } from '../../../../entities/report.entity';
import { TemplateSourceTypeEnum } from '../../../../enums/template-source-type.enum';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { ReportCondition } from '../../../enums/report-condition.enum';
import { buildGoogleChatMessages, GoogleChatReportWriter } from './google-chat-report-writer';

jest.mock('../../../../../common/markdown/markdown-parser.service', () => ({
  COLOR_THEME: { LIGHT: 'LIGHT' },
  MarkdownParser: function MarkdownParser() {},
}));

describe('GoogleChatReportWriter', () => {
  const webhookUrl =
    'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';

  const createReport = (): Report =>
    ({
      id: 'report-1',
      title: 'Report',
      createdById: 'user-1',
      destinationConfig: {
        type: 'email-config',
        subject: 'Weekly report',
        reportCondition: ReportCondition.ALWAYS,
        templateSource: {
          type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
          config: { messageTemplate: '# Revenue\n\n**Up 12%**' },
        },
      },
      dataDestination: {
        id: 'destination-1',
        type: DataDestinationType.GOOGLE_CHAT,
      },
      dataMart: {
        id: 'data-mart-1',
        title: 'Sales',
        projectId: 'project-1',
      },
    }) as Report;

  const createWriter = (credentials: object = { type: 'google-chat-credentials', webhookUrl }) => {
    const emailProvider = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const webhookClient = { send: jest.fn().mockResolvedValue(undefined) };
    const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };
    const writer = new GoogleChatReportWriter(
      emailProvider as never,
      { parseToHtml: jest.fn().mockResolvedValue('<p>Rendered</p>') } as never,
      { getPublicOrigin: jest.fn().mockReturnValue('https://example.test') } as never,
      {
        render: jest.fn().mockResolvedValue({
          rendered: '# Revenue\n\n**Up 12%**',
          status: DataMartInsightTemplateStatus.OK,
          prompts: [],
        }),
      } as never,
      eventDispatcher as never,
      { resolve: jest.fn().mockResolvedValue(credentials) } as never,
      { buildRenderContext: jest.fn() } as never,
      { getByIdAndDataMartIdWithSourceEntities: jest.fn() } as never,
      { getUsedSourceKeys: jest.fn() } as never,
      webhookClient as never
    );

    return { writer, emailProvider, webhookClient, eventDispatcher };
  };

  it('posts the complete rendered Insight directly to Google Chat', async () => {
    const { writer, emailProvider, webhookClient, eventDispatcher } = createWriter();

    await writer.prepareToWriteReport(createReport(), new ReportDataDescription([]));
    await writer.finalize();

    expect(emailProvider.sendEmail).not.toHaveBeenCalled();
    expect(webhookClient.send).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({ cardsV2: expect.any(Array) })
    );
    const payload = webhookClient.send.mock.calls[0][1];
    expect(payload.cardsV2[0].card.header).toEqual({
      title: 'Weekly report',
      subtitle: 'Data Mart: Sales',
    });
    expect(payload.cardsV2[0].card.sections[0].widgets[0].textParagraph).toEqual({
      text: '# Revenue\n\n**Up 12%**',
      textSyntax: 'MARKDOWN',
    });
    expect(payload.fallbackText).toBe('Weekly report — Data Mart: Sales');
    expect(JSON.stringify(payload)).toContain(
      'https://example.test/ui/project-1/data-marts/data-mart-1/reports'
    );
    expect(eventDispatcher.publishExternal.mock.calls[0][0].name).toBe(
      'google-chat.report.run.successfully'
    );
  });

  it('delivers through the Google Chat channel email when configured', async () => {
    const { writer, emailProvider, webhookClient } = createWriter({
      type: 'email-credentials',
      to: ['space@example.com'],
    });

    await writer.prepareToWriteReport(createReport(), new ReportDataDescription([]));
    await writer.finalize();

    expect(emailProvider.sendEmail).toHaveBeenCalledWith(
      ['space@example.com'],
      'Weekly report',
      expect.any(String)
    );
    expect(webhookClient.send).not.toHaveBeenCalled();
  });

  it('splits oversized Insights without dropping multibyte content', () => {
    const markdown = `# Large insight\n${'Д'.repeat(16_000)}`;
    const messages = buildGoogleChatMessages({
      subject: 'Large report',
      markdown,
      dataMartTitle: 'Sales',
      reportUrl: 'https://example.test/report',
    });

    expect(messages).toHaveLength(2);
    const combined = messages
      .map(message => message.cardsV2[0].card.sections[0].widgets[0])
      .map(widget => ('textParagraph' in widget ? widget.textParagraph.text : ''))
      .join('');
    expect(combined).toBe(markdown);
    expect(messages[0].cardsV2[0].card.header.subtitle).toContain('Part 1 of 2');
    expect(messages.every(message => Buffer.byteLength(JSON.stringify(message)) <= 30_000)).toBe(
      true
    );
  });

  it('sizes complete serialized payloads when Markdown contains JSON escape characters', () => {
    const markdown = '"\n'.repeat(12_000);
    const messages = buildGoogleChatMessages({
      subject: 'Escaped content',
      markdown,
      dataMartTitle: 'Sales',
      reportUrl: 'https://example.test/report',
    });

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(message => Buffer.byteLength(JSON.stringify(message)) <= 30_000)).toBe(
      true
    );
    expect(
      messages
        .map(message => message.cardsV2[0].card.sections[0].widgets[0])
        .map(widget => ('textParagraph' in widget ? widget.textParagraph.text : ''))
        .join('')
    ).toBe(markdown.trim());
  });

  it('truncates unusually large headers while keeping the payload valid', () => {
    const messages = buildGoogleChatMessages({
      subject: 'S'.repeat(40_000),
      markdown: 'Insight',
      dataMartTitle: 'D'.repeat(40_000),
      reportUrl: 'https://example.test/report',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].cardsV2[0].card.header.title).toMatch(/…$/);
    expect(messages[0].cardsV2[0].card.header.subtitle).toContain('…');
    expect(Buffer.byteLength(JSON.stringify(messages[0]))).toBeLessThanOrEqual(30_000);
  });

  it('rejects an excessive number of parts before delivery starts', () => {
    expect(() =>
      buildGoogleChatMessages({
        subject: 'Too large',
        markdown: '\u0000'.repeat(120_000),
        dataMartTitle: 'Sales',
        reportUrl: 'https://example.test/report',
      })
    ).toThrow('exceeds the 20-message delivery limit');
  });
});
