// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
const GOOGLE_CHAT_WEBHOOK_PATH = /^\/v1\/spaces\/[^/]+\/messages$/;

export function isGoogleChatWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'chat.googleapis.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      GOOGLE_CHAT_WEBHOOK_PATH.test(url.pathname) &&
      Boolean(url.searchParams.get('key')) &&
      Boolean(url.searchParams.get('token'))
    );
  } catch {
    return false;
  }
}
