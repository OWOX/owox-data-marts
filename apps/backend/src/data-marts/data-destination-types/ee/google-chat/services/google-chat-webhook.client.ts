import { Injectable } from '@nestjs/common';
import { isGoogleChatWebhookUrl } from '../schemas/google-chat-credentials.schema';

export interface GoogleChatMessagePayload {
  fallbackText: string;
  cardsV2: Array<{
    cardId: string;
    card: {
      header: {
        title: string;
        subtitle: string;
      };
      sections: Array<{
        widgets: Array<
          | {
              textParagraph: {
                text: string;
                textSyntax: 'MARKDOWN';
              };
            }
          | {
              buttonList: {
                buttons: Array<{
                  text: string;
                  onClick: { openLink: { url: string } };
                }>;
              };
            }
        >;
      }>;
    };
  }>;
}

@Injectable()
export class GoogleChatWebhookClient {
  private static readonly REQUEST_TIMEOUT_MS = 10_000;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RETRY_BASE_DELAY_MS = 1_000;

  async send(webhookUrl: string, payload: GoogleChatMessagePayload): Promise<void> {
    // The URL contains a secret token and is also the outbound request target. Validate it
    // again at the network boundary even though destination credentials are validated on save.
    if (!isGoogleChatWebhookUrl(webhookUrl)) {
      throw new Error('Invalid Google Chat incoming webhook URL');
    }

    for (let attempt = 1; attempt <= GoogleChatWebhookClient.MAX_ATTEMPTS; attempt += 1) {
      const response = await this.post(webhookUrl, payload);
      if (response.ok) return;

      if (response.status === 429 && attempt < GoogleChatWebhookClient.MAX_ATTEMPTS) {
        const retryDelayMs = this.getRetryDelayMs(response, attempt);
        if (retryDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
        continue;
      }

      throw new Error(`Google Chat API returned HTTP ${response.status}`);
    }
  }

  private async post(webhookUrl: string, payload: GoogleChatMessagePayload): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GoogleChatWebhookClient.REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'User-Agent': 'OWOX-DataMarts-Google-Chat/1.0',
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: controller.signal,
      });
      await response.body?.cancel().catch(() => undefined);
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Google Chat API request timed out');
      }
      // Fetch implementations can attach the request URL to low-level network errors. Do not
      // propagate those details because Google Chat webhook URLs contain a secret token.
      throw new Error('Google Chat API request failed');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getRetryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers?.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
    }

    const exponentialDelay = GoogleChatWebhookClient.RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    return exponentialDelay + Math.floor(Math.random() * 250);
  }
}
