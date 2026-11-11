/**
 * Whether a message from the Cloudflare Stream player says the video started playing.
 *
 * The player in its iframe posts its media events to the page as
 * `{ __privateUnstableMessageType: 'event', eventName }`, the messages Cloudflare's Player SDK
 * listens to. Reading them here spares the app that third-party script. The format is not
 * public: if Cloudflare changes it, only the play event stops arriving.
 */
export function isPlayerPlayMessage(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;
  return message.__privateUnstableMessageType === 'event' && message.eventName === 'play';
}
