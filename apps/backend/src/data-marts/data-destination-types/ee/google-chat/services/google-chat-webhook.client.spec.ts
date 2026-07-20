import { GoogleChatMessagePayload, GoogleChatWebhookClient } from './google-chat-webhook.client';

describe('GoogleChatWebhookClient', () => {
  const webhookUrl =
    'https://chat.googleapis.com/v1/spaces/space-1/messages?key=key-1&token=token-1';
  const payload: GoogleChatMessagePayload = {
    fallbackText: 'Report — Data Mart: Sales',
    cardsV2: [
      {
        cardId: 'owox-insight-1',
        card: {
          header: { title: 'Report', subtitle: 'Data Mart: Sales' },
          sections: [
            {
              widgets: [{ textParagraph: { text: '**Insight**', textSyntax: 'MARKDOWN' } }],
            },
          ],
        },
      },
    ],
  };

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('posts a card payload without following redirects', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, body: { cancel } } as unknown as Response);

    await new GoogleChatWebhookClient().send(webhookUrl, payload);

    expect(fetchMock).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify(payload),
      })
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 429 responses up to the bounded attempt limit', async () => {
    const retryHeaders = { get: jest.fn().mockReturnValue('0') };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: retryHeaders,
      } as unknown as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    await new GoogleChatWebhookClient().send(webhookUrl, payload);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops after three HTTP 429 attempts', async () => {
    const retryHeaders = { get: jest.fn().mockReturnValue('0') };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 429, headers: retryHeaders } as unknown as Response);

    await expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.toThrow(
      'Google Chat API returned HTTP 429'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not include the secret webhook URL in API errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response);

    await expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.toThrow(
      'Google Chat API returned HTTP 403'
    );
    await expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.not.toThrow(
      webhookUrl
    );
  });

  it('sanitizes low-level network errors that could contain the secret URL', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error(`request failed for ${webhookUrl}`));

    await expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.toThrow(
      'Google Chat API request failed'
    );
    await expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.not.toThrow(
      webhookUrl
    );
  });

  it('blocks non-Google request targets before calling fetch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      new GoogleChatWebhookClient().send('https://example.com/webhook', payload)
    ).rejects.toThrow('Invalid Google Chat incoming webhook URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts requests that exceed the timeout', async () => {
    jest.useFakeTimers();
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    });

    const request = expect(new GoogleChatWebhookClient().send(webhookUrl, payload)).rejects.toThrow(
      'Google Chat API request timed out'
    );
    await jest.advanceTimersByTimeAsync(10_000);

    await request;
  });
});
