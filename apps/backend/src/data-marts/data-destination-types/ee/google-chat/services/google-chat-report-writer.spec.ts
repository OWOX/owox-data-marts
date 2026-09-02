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
        title: 'Team Chat',
        type: DataDestinationType.GOOGLE_CHAT,
      },
      dataMart: {
        id: 'data-mart-1',
        title: 'Sales',
        projectId: 'project-1',
      },
    }) as Report;

  const createWriter = (
    credentials: object = { type: 'google-chat-credentials', webhookUrl },
    rendered = '# Revenue\n\n**Up 12%**'
  ) => {
    const emailProvider = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const webhookClient = { send: jest.fn().mockResolvedValue(undefined) };
    const eventDispatcher = { publishExternal: jest.fn().mockResolvedValue(undefined) };
    const executionLogger = {
      log: jest.fn(),
      error: jest.fn(),
      asArrays: jest.fn().mockReturnValue({ logs: [], errors: [] }),
    };
    const writer = new GoogleChatReportWriter(
      emailProvider as never,
      { parseToHtml: jest.fn().mockResolvedValue('<p>Rendered</p>') } as never,
      { getPublicOrigin: jest.fn().mockReturnValue('https://example.test') } as never,
      {
        render: jest.fn().mockResolvedValue({
          rendered,
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
    writer.setExecutionContext({ runId: 'run-1', logger: executionLogger });

    return { writer, emailProvider, webhookClient, eventDispatcher, executionLogger };
  };

  it('posts the complete rendered Insight directly to Google Chat', async () => {
    const { writer, emailProvider, webhookClient, eventDispatcher, executionLogger } =
      createWriter();

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
      text: '**Revenue**\n\n**Up 12%**',
      textSyntax: 'MARKDOWN',
    });
    expect(payload.fallbackText).toBe('Weekly report — Data Mart: Sales');
    // The card link opens this report's own panel, not the Data Mart's report list.
    expect(JSON.stringify(payload)).toContain(
      'https://example.test/ui/project-1/data-marts/data-mart-1/reports?reportId=report-1'
    );
    expect(eventDispatcher.publishExternal.mock.calls[0][0].name).toBe(
      'google-chat.report.run.successfully'
    );
    expect(executionLogger.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'google_chat_part_sent' })
    );
    expect(executionLogger.log).toHaveBeenCalledWith({
      type: 'google_chat_sent',
      deliveryMethod: 'incoming_webhook',
      destinationId: 'destination-1',
      destinationTitle: 'Team Chat',
      spaceId: 'space-1',
      messageCount: 1,
    });
  });

  it('logs partial delivery before propagating a later part failure', async () => {
    const { writer, webhookClient, executionLogger } = createWriter(
      { type: 'google-chat-credentials', webhookUrl },
      `# Large insight\n${'Д'.repeat(16_000)}`
    );
    webhookClient.send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Google Chat API request failed'));

    await writer.prepareToWriteReport(createReport(), new ReportDataDescription([]));
    await expect(writer.finalize()).rejects.toThrow('Google Chat API request failed');

    expect(executionLogger.log).toHaveBeenCalledWith({
      type: 'google_chat_part_sent',
      deliveryMethod: 'incoming_webhook',
      destinationId: 'destination-1',
      destinationTitle: 'Team Chat',
      spaceId: 'space-1',
      part: 1,
      totalParts: 2,
    });
    expect(executionLogger.log).toHaveBeenCalledWith({
      type: 'google_chat_part_failed',
      deliveryMethod: 'incoming_webhook',
      destinationId: 'destination-1',
      destinationTitle: 'Team Chat',
      spaceId: 'space-1',
      part: 2,
      totalParts: 2,
      deliveredParts: 1,
    });
    expect(executionLogger.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'google_chat_sent' })
    );
  });

  it('delivers through the Google Chat channel email when configured', async () => {
    const { writer, emailProvider, webhookClient, executionLogger } = createWriter({
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
    expect(executionLogger.log).toHaveBeenCalledWith({
      type: 'google_chat_sent',
      deliveryMethod: 'channel_email',
      destinationId: 'destination-1',
      destinationTitle: 'Team Chat',
      recipients: ['space@example.com'],
    });
  });

  it('reports invalid Google Chat credentials without an email-specific error', async () => {
    const { writer } = createWriter({ type: 'email-credentials', to: [] });

    await expect(
      writer.prepareToWriteReport(createReport(), new ReportDataDescription([]))
    ).rejects.toThrow(
      'Google Chat destination has neither valid webhook nor channel-email credentials'
    );
  });

  it('splits oversized Insights without dropping multibyte content', () => {
    const markdown = `Large insight\n${'Д'.repeat(16_000)}`;
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

  it('downlevels unsupported headings and tables while preserving supported Markdown', () => {
    const messages = buildGoogleChatMessages({
      subject: 'Representative insight',
      markdown: '# Revenue\n\n**Up 12%**\n\n| Metric | Value |\n| --- | ---: |\n| Revenue | $10 |',
      dataMartTitle: 'Sales',
      reportUrl: 'https://example.test/report',
    });

    const widget = messages[0].cardsV2[0].card.sections[0].widgets[0];
    expect(widget).toEqual({
      textParagraph: {
        text: '**Revenue**\n\n**Up 12%**\n\n```\n| Metric | Value |\n| --- | ---: |\n| Revenue | $10 |\n```',
        textSyntax: 'MARKDOWN',
      },
    });
  });

  it('does not rewrite heading or table-like text inside fenced code blocks', () => {
    const markdown = '```\n# Heading-like code\n| A | B |\n| --- | --- |\n```';
    const messages = buildGoogleChatMessages({
      subject: 'Code sample',
      markdown,
      dataMartTitle: 'Sales',
      reportUrl: 'https://example.test/report',
    });

    expect(messages[0].cardsV2[0].card.sections[0].widgets[0]).toEqual({
      textParagraph: { text: markdown, textSyntax: 'MARKDOWN' },
    });
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
