import { OWOXApiError } from './errors.js';

export type OWOXMarkdownParseRequest = {
  markdown: string;
};

export type OWOXMarkdownParseResponse = string;

type MarkdownRequester = {
  postJson<T>(path: string, jsonBody: unknown, accept?: string): Promise<T>;
};

function parseMarkdownResponse(response: unknown): OWOXMarkdownParseResponse {
  if (typeof response !== 'string') {
    throw new OWOXApiError('OWOX Markdown API returned an unexpected response shape', {
      details: response,
    });
  }

  return response;
}

export class MarkdownApi {
  constructor(private readonly requester: MarkdownRequester) {}

  async parseToHtml(request: OWOXMarkdownParseRequest): Promise<OWOXMarkdownParseResponse> {
    return parseMarkdownResponse(
      await this.requester.postJson<unknown>('/api/markdown/parse-to-html', request, 'text/html')
    );
  }
}
