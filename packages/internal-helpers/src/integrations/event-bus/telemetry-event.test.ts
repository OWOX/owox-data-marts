import { BaseEvent } from './base-event.js';
import { TelemetryEvent, isTelemetryEvent } from './telemetry-event.js';

class FakeTelemetryEvent extends TelemetryEvent<{ anonymousId: string }> {
  override get name(): string {
    return 'test.telemetry';
  }
}

class FakeDomainEvent extends BaseEvent<{ email: string }> {
  override get name(): string {
    return 'user.created';
  }
}

describe('TelemetryEvent', () => {
  it('is recognized by isTelemetryEvent', () => {
    const event = new FakeTelemetryEvent({ anonymousId: 'abc' });
    expect(isTelemetryEvent(event)).toBe(true);
    expect(event.name).toBe('test.telemetry');
    expect(event.payload).toEqual({ anonymousId: 'abc' });
  });

  it('rejects non-telemetry BaseEvent', () => {
    const event = new FakeDomainEvent({ email: 'a@b.com' });
    expect(isTelemetryEvent(event)).toBe(false);
  });

  it('rejects plain objects', () => {
    expect(isTelemetryEvent({ name: 'x', payload: {} })).toBe(false);
    expect(isTelemetryEvent(null)).toBe(false);
  });
});
