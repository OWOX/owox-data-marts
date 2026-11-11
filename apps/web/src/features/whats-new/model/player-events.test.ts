import { describe, expect, it } from 'vitest';
import { isPlayerPlayMessage } from './player-events';

describe('isPlayerPlayMessage', () => {
  it("accepts the player's play event", () => {
    expect(isPlayerPlayMessage({ __privateUnstableMessageType: 'event', eventName: 'play' })).toBe(
      true
    );
  });

  it.each([
    ['another event', { __privateUnstableMessageType: 'event', eventName: 'pause' }],
    ['another message type', { __privateUnstableMessageType: 'iframeReady' }],
    ['a plain string', 'play'],
    ['null', null],
  ])('rejects %s', (_, data) => {
    expect(isPlayerPlayMessage(data)).toBe(false);
  });
});
