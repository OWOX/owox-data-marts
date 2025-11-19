import apiClient from '../../app/api/apiClient';

/**
 * Converts Markdown to HTML via backend endpoint.
 * Keeps responseType as text to avoid axios JSON parsing.
 */
export function parseMarkdownToHtml(markdown: string, signal?: AbortSignal): Promise<string> {
  return apiClient
    .post<string>(
      '/markdown/parse-to-html',
      { markdown },
      { headers: { 'Content-Type': 'application/json' }, responseType: 'text', signal }
    )
    .then(res => res.data);
}
