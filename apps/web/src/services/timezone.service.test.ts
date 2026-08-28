import { afterEach, describe, expect, it, vi } from 'vitest';
import { timezoneService } from './timezone.service';

describe('timezoneService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers one explicit UTC choice even when the runtime omits or aliases it', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Etc/UTC', 'Europe/Kiev', 'GMT', 'UTC']);

    expect(timezoneService.getTimezones()).toEqual(['UTC', 'Europe/Kiev']);
  });

  it('describes UTC as fixed without DST and uses the modern Kyiv display name', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Kiev']);

    const timezones = timezoneService.getTimezonesWithOffset();

    expect(timezones[0]).toEqual({
      identifier: 'UTC',
      displayName: 'UTC (+00:00, no DST)',
      offsetMinutes: 0,
      offsetString: '+00:00',
      isDST: false,
    });
    expect(timezones.find(timezone => timezone.identifier === 'Europe/Kiev')?.displayName).toMatch(
      /^Europe\/Kyiv \([+-]\d{2}:\d{2}\)$/
    );
  });
});
