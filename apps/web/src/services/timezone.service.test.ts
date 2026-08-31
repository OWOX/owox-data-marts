import { afterEach, describe, expect, it, vi } from 'vitest';
import { timezoneService } from './timezone.service';

describe('timezoneService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers one explicit UTC choice even when the runtime omits or aliases it', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Etc/UTC', 'Europe/Kiev', 'GMT', 'UTC']);

    expect(timezoneService.getTimezones()).toEqual(['UTC', 'Europe/Kyiv']);
  });

  it('deduplicates legacy and modern identifiers into canonical picker choices', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([
      'Europe/Kiev',
      'Europe/Kyiv',
      'Etc/UTC',
      'UTC',
    ]);

    expect(timezoneService.getTimezones()).toEqual(['UTC', 'Europe/Kyiv']);
  });

  it.each([
    ['Etc/UTC', 'UTC'],
    ['GMT', 'UTC'],
    ['Etc/GMT', 'UTC'],
    ['Europe/Kiev', 'Europe/Kyiv'],
  ])('canonicalizes %s as %s', (timezone, canonicalTimezone) => {
    expect(timezoneService.canonicalizeTimezone(timezone)).toBe(canonicalTimezone);
  });

  it.each(['Etc/UTC', 'GMT', 'Etc/GMT'])(
    'uses the UTC display name for the stored %s alias',
    timezone => {
      expect(timezoneService.getTimezoneDisplayName(timezone)).toBe('UTC');
    }
  );

  it.each(['Etc/UTC', 'GMT', 'Etc/GMT'])(
    'treats the stored %s alias as equivalent to UTC',
    timezone => {
      expect(timezoneService.areTimezonesEquivalent(timezone, 'UTC')).toBe(true);
    }
  );

  it('treats the legacy and modern Kyiv identifiers as equivalent', () => {
    expect(timezoneService.areTimezonesEquivalent('Europe/Kiev', 'Europe/Kyiv')).toBe(true);
  });

  it('keeps hidden aliases searchable through the canonical picker choice', () => {
    expect(timezoneService.getTimezoneSearchKeywords('UTC')).toEqual(
      expect.arrayContaining(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT'])
    );
    expect(timezoneService.getTimezoneSearchKeywords('Europe/Kyiv')).toEqual(
      expect.arrayContaining(['Europe/Kiev', 'Europe/Kyiv'])
    );
  });

  it('uses the legacy Kyiv identifier for calculations when the runtime rejects the modern spelling', () => {
    const DateTimeFormat = Intl.DateTimeFormat;
    const dateTimeFormatSpy = vi
      .spyOn(Intl, 'DateTimeFormat')
      .mockImplementation(function (locales, options) {
        if (options?.timeZone === 'Europe/Kyiv') {
          throw new RangeError('Unsupported time zone');
        }
        return new DateTimeFormat(locales, options);
      });
    const summerDate = new Date('2026-07-15T10:00:00.000Z');

    expect(timezoneService.getTimezoneOffset('Europe/Kyiv', summerDate)).toBe(180);
    expect(timezoneService.isDaylightSavingTime('Europe/Kyiv', summerDate)).toBe(true);
    expect(dateTimeFormatSpy).toHaveBeenCalledWith(
      'en-US',
      expect.objectContaining({ timeZone: 'Europe/Kiev' })
    );
  });

  it('describes UTC as fixed without DST and uses the modern Kyiv display name', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Europe/Kiev']);

    const timezones = timezoneService.getTimezonesWithOffset();

    expect(timezones[0]).toEqual({
      identifier: 'UTC',
      displayName: 'UTC (+00:00)',
      offsetMinutes: 0,
      offsetString: '+00:00',
      isDST: false,
    });
    expect(timezones.find(timezone => timezone.identifier === 'Europe/Kyiv')?.displayName).toMatch(
      /^Europe\/Kyiv \([+-]\d{2}:\d{2}\)$/
    );
  });
});
