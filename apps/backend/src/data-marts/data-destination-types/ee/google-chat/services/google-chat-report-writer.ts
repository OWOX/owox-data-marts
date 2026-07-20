import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { PublicOriginService } from '../../../../../common/config/public-origin.service';
import {
  EMAIL_PROVIDER_FACADE,
  EmailProviderFacade,
} from '../../../../../common/email/shared/email-provider.facade';
import { OwoxEventDispatcher } from '../../../../../common/event-dispatcher/owox-event-dispatcher';
import { MarkdownParser } from '../../../../../common/markdown/markdown-parser.service';
import { buildDataMartUrl } from '../../../../../common/helpers/data-mart-url.helper';
import { DataMartInsightTemplateFacadeImpl } from '../../../../ai-insights/data-mart-insight-template.facade';
import { Report } from '../../../../entities/report.entity';
import { InsightTemplateSourceDataService } from '../../../../services/insight-template-source-data.service';
import { InsightTemplateService } from '../../../../services/insight-template.service';
import { InsightTemplateSourceUsageService } from '../../../../services/insight-template-source-usage.service';
import { DataDestinationCredentialsResolver } from '../../../data-destination-credentials-resolver.service';
import { DataDestinationType } from '../../../enums/data-destination-type.enum';
import { BaseEmailReportWriter } from '../../email/services/email-report-writer';
import {
  GoogleChatCredentials,
  GoogleChatCredentialsSchema,
} from '../schemas/google-chat-credentials.schema';
import { GoogleChatMessagePayload, GoogleChatWebhookClient } from './google-chat-webhook.client';

const MAX_GOOGLE_CHAT_PAYLOAD_BYTES = 30_000;
const MAX_GOOGLE_CHAT_MESSAGE_PARTS = 20;
const MAX_HEADER_FIELD_BYTES = 512;
const GOOGLE_CHAT_WRITE_INTERVAL_MS = 1_100;

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;

  const suffix = '…';
  const availableBytes = maxBytes - Buffer.byteLength(suffix, 'utf8');
  let result = '';
  let usedBytes = 0;

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (usedBytes + characterBytes > availableBytes) break;
    result += character;
    usedBytes += characterBytes;
  }

  return `${result}${suffix}`;
}

function buildGoogleChatMessage(input: {
  subject: string;
  dataMartTitle: string;
  reportUrl: string;
  chunk: string;
  index: number;
  total: number;
}): GoogleChatMessagePayload {
  const partLabel = input.total > 1 ? ` · Part ${input.index + 1} of ${input.total}` : '';
  const subtitle = `Data Mart: ${input.dataMartTitle}${partLabel}`;

  return {
    fallbackText: `${input.subject} — ${subtitle}`,
    cardsV2: [
      {
        cardId: `owox-insight-${input.index + 1}`,
        card: {
          header: {
            title: input.subject,
            subtitle,
          },
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: input.chunk,
                    textSyntax: 'MARKDOWN',
                  },
                },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: 'Open report in OWOX',
                        onClick: { openLink: { url: input.reportUrl } },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function serializedPayloadBytes(payload: GoogleChatMessagePayload): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

function splitMarkdownForGoogleChat(input: {
  markdown: string;
  subject: string;
  dataMartTitle: string;
  reportUrl: string;
}): string[] {
  const characters = Array.from(input.markdown);
  const chunks: string[] = [];
  let offset = 0;

  const fits = (chunk: string): boolean =>
    serializedPayloadBytes(
      buildGoogleChatMessage({
        ...input,
        chunk,
        index: MAX_GOOGLE_CHAT_MESSAGE_PARTS - 1,
        total: MAX_GOOGLE_CHAT_MESSAGE_PARTS,
      })
    ) <= MAX_GOOGLE_CHAT_PAYLOAD_BYTES;

  if (!fits('')) {
    throw new Error('Google Chat message headers exceed the API size limit');
  }

  while (offset < characters.length) {
    if (chunks.length >= MAX_GOOGLE_CHAT_MESSAGE_PARTS) {
      throw new Error(
        `Google Chat Insight exceeds the ${MAX_GOOGLE_CHAT_MESSAGE_PARTS}-message delivery limit`
      );
    }

    let low = 1;
    let high = characters.length - offset;
    let bestLength = 0;

    while (low <= high) {
      const candidateLength = Math.floor((low + high) / 2);
      const candidate = characters.slice(offset, offset + candidateLength).join('');
      if (fits(candidate)) {
        bestLength = candidateLength;
        low = candidateLength + 1;
      } else {
        high = candidateLength - 1;
      }
    }

    if (bestLength === 0) {
      throw new Error('Unable to split Google Chat message within the API size limit');
    }

    const candidateCharacters = characters.slice(offset, offset + bestLength);
    const lastNewlineIndex = candidateCharacters.lastIndexOf('\n');
    const hasMoreContent = bestLength < characters.length - offset;
    const splitLength =
      hasMoreContent && lastNewlineIndex >= 0 && lastNewlineIndex + 1 >= Math.floor(bestLength / 2)
        ? lastNewlineIndex + 1
        : bestLength;

    chunks.push(candidateCharacters.slice(0, splitLength).join(''));
    offset += splitLength;
  }

  return chunks;
}

export function buildGoogleChatMessages(input: {
  subject: string;
  markdown: string;
  dataMartTitle: string;
  reportUrl: string;
}): GoogleChatMessagePayload[] {
  const messageInput = {
    subject: truncateUtf8(input.subject, MAX_HEADER_FIELD_BYTES),
    dataMartTitle: truncateUtf8(input.dataMartTitle, MAX_HEADER_FIELD_BYTES),
    reportUrl: input.reportUrl,
  };
  const markdown = input.markdown.trim() || 'No content';
  const chunks = splitMarkdownForGoogleChat({ ...messageInput, markdown });

  const messages = chunks.map((chunk, index) =>
    buildGoogleChatMessage({
      ...messageInput,
      chunk,
      index,
      total: chunks.length,
    })
  );

  if (messages.some(message => serializedPayloadBytes(message) > MAX_GOOGLE_CHAT_PAYLOAD_BYTES)) {
    throw new Error('Google Chat message exceeds the API size limit');
  }

  return messages;
}

@Injectable({ scope: Scope.TRANSIENT })
export class GoogleChatReportWriter extends BaseEmailReportWriter {
  protected readonly logger = new Logger(GoogleChatReportWriter.name);
  readonly type = DataDestinationType.GOOGLE_CHAT;

  private googleChatCredentials?: GoogleChatCredentials;
  private usesEmailDelivery = false;

  constructor(
    @Inject(EMAIL_PROVIDER_FACADE) emailProvider: EmailProviderFacade,
    markdownParser: MarkdownParser,
    private readonly chatPublicOriginService: PublicOriginService,
    insightTemplateFacade: DataMartInsightTemplateFacadeImpl,
    eventDispatcher: OwoxEventDispatcher,
    credentialsResolver: DataDestinationCredentialsResolver,
    sourceDataService: InsightTemplateSourceDataService,
    insightTemplateService: InsightTemplateService,
    sourceUsageService: InsightTemplateSourceUsageService,
    private readonly webhookClient: GoogleChatWebhookClient
  ) {
    super(
      emailProvider,
      markdownParser,
      chatPublicOriginService,
      insightTemplateFacade,
      eventDispatcher,
      credentialsResolver,
      sourceDataService,
      insightTemplateService,
      sourceUsageService
    );
  }

  protected override async prepareDeliveryCredentials(report: Report): Promise<void> {
    const resolvedCredentials = await this.credentialsResolver.resolve(report.dataDestination);
    const parsed = GoogleChatCredentialsSchema.safeParse(resolvedCredentials);

    if (parsed.success) {
      this.googleChatCredentials = parsed.data;
      this.usesEmailDelivery = false;
      return;
    }

    // Channel email remains a supported delivery method for existing and new destinations.
    this.usesEmailDelivery = true;
    await super.prepareDeliveryCredentials(report);
  }

  protected override async sendRenderedMessage(markdownContent: string): Promise<void> {
    if (this.usesEmailDelivery) {
      await super.sendRenderedMessage(markdownContent);
      return;
    }

    if (!this.googleChatCredentials) {
      throw new Error('Google Chat webhook credentials are not configured');
    }

    const reportUrl = buildDataMartUrl(
      this.chatPublicOriginService.getPublicOrigin(),
      this.report.dataMart.projectId,
      this.report.dataMart.id,
      '/reports'
    );
    const messages = buildGoogleChatMessages({
      subject: this.emailConfig.subject,
      markdown: markdownContent,
      dataMartTitle: this.report.dataMart.title,
      reportUrl,
    });

    for (let index = 0; index < messages.length; index += 1) {
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, GOOGLE_CHAT_WRITE_INTERVAL_MS));
      }
      await this.webhookClient.send(this.googleChatCredentials.webhookUrl, messages[index]);
    }

    this.executionLogger?.log({
      type: 'google_chat_sent',
      messageCount: messages.length,
    });
  }
}
