import { BadRequestException } from '@nestjs/common';
import {
  decodeCredentialAiOptions,
  encodeCredentialAiValue,
  sanitizeCredentialAiGenerateResult,
  sanitizeCredentialAiStreamPart,
} from './credential-ai-portable';

describe('Credential AI portable contract', () => {
  it('round-trips binary and URL values while removing plugin provider controls', () => {
    const encoded = encodeCredentialAiValue({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'file', data: new Uint8Array([1, 2, 3]) },
            { type: 'file', data: new URL('https://files.example.test/a.pdf') },
          ],
          providerOptions: { openai: { cache: true } },
        },
      ],
      headers: { authorization: 'plugin-value' },
      providerOptions: { openai: { unsafe: true } },
    });
    const signal = new AbortController().signal;

    const decoded = decodeCredentialAiOptions(encoded, signal);

    expect(decoded).not.toHaveProperty('headers');
    expect(decoded).not.toHaveProperty('providerOptions');
    expect(decoded).toMatchObject({ includeRawChunks: false, abortSignal: signal });
    const content = (decoded.prompt as Array<{ content: Array<{ data: unknown }> }>)[0].content;
    expect(content[0].data).toEqual(new Uint8Array([1, 2, 3]));
    expect(content[1].data).toEqual(new URL('https://files.example.test/a.pdf'));
    expect(JSON.stringify(decoded)).not.toContain('providerOptions');
  });

  it('strips provider metadata, raw usage and response/request echoes from generate results', () => {
    const result = sanitizeCredentialAiGenerateResult({
      content: [{ type: 'text', text: 'ok', providerMetadata: { provider: { secret: 'x' } } }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 }, raw: { billed: 2 } },
      warnings: [],
      request: { body: { secret: 'x' } },
      response: { headers: { authorization: 'x' } },
    } as never);

    expect(result).toMatchObject({ content: [{ type: 'text', text: 'ok' }] });
    expect(JSON.stringify(result)).not.toMatch(/providerMetadata|billed|authorization|secret/);
  });

  it('normalizes stream failures and suppresses raw provider chunks', () => {
    expect(sanitizeCredentialAiStreamPart({ type: 'raw', rawValue: { secret: 'x' } })).toBeNull();
    expect(
      sanitizeCredentialAiStreamPart({ type: 'error', error: new Error('Bearer secret') })
    ).toEqual({
      type: 'error',
      error: { name: 'Error', message: 'AI provider request failed' },
    });
  });

  it('rejects malformed portable binary input', () => {
    expect(() =>
      decodeCredentialAiOptions(
        {
          prompt: {
            $owoxCredentialPortableType: 'bytes',
            value: 'not-base64!',
          },
        },
        new AbortController().signal
      )
    ).toThrow(BadRequestException);
  });
});
