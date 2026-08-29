/**
 * Interface for timezone data with offset information
 */
interface TimezoneData {
  /**
   * Timezone identifier (e.g., 'Europe/London')
   */
  identifier: string;

  /**
   * Human-readable display name
   */
  displayName: string;

  /**
   * Current UTC offset in minutes
   */
  offsetMinutes: number;

  /**
   * Current UTC offset as string (e.g., '+02:00')
   */
  offsetString: string;

  /**
   * Whether the timezone is currently in DST
   */
  isDST: boolean;
}

interface TimezonePresentationOverride {
  canonicalIdentifier: string;
  displayName: string;
}

const UTC_TIMEZONE = 'UTC';
const TIMEZONE_PRESENTATION_OVERRIDES = new Map<string, TimezonePresentationOverride>([
  ['Etc/UTC', { canonicalIdentifier: UTC_TIMEZONE, displayName: UTC_TIMEZONE }],
  ['GMT', { canonicalIdentifier: UTC_TIMEZONE, displayName: UTC_TIMEZONE }],
  ['Etc/GMT', { canonicalIdentifier: UTC_TIMEZONE, displayName: UTC_TIMEZONE }],
  ['Europe/Kiev', { canonicalIdentifier: 'Europe/Kyiv', displayName: 'Europe/Kyiv' }],
]);

/**
 * Service for providing timezone data.
 * Currently returns a fixed list of timezones from Intl.supportedValuesOf('timeZone'),
 * but can be updated in the future to fetch from an API.
 */
class TimezoneService {
  /**
   * Get a list of all available timezones.
   * @returns {string[]} Array of timezone identifiers
   */
  getTimezones(): string[] {
    // Currently using the browser's Intl API to get supported timezones
    // This could be replaced with an API call in the future
    const runtimeTimezones = Intl.supportedValuesOf('timeZone').map(timezone =>
      this.canonicalizeTimezone(timezone)
    );

    return [...new Set([UTC_TIMEZONE, ...runtimeTimezones])];
  }

  /**
   * Get the canonical identifier used by timezone selection and new schedule defaults.
   * @param timezone - Stored timezone identifier
   * @returns {string} Canonical timezone identifier
   */
  canonicalizeTimezone(timezone: string): string {
    return TIMEZONE_PRESENTATION_OVERRIDES.get(timezone)?.canonicalIdentifier ?? timezone;
  }

  /**
   * Check whether two stored timezone identifiers represent the same picker timezone.
   * @param firstTimezone - First stored timezone identifier
   * @param secondTimezone - Second stored timezone identifier
   * @returns {boolean} Whether both identifiers have the same picker representation
   */
  areTimezonesEquivalent(firstTimezone: string, secondTimezone: string): boolean {
    return this.canonicalizeTimezone(firstTimezone) === this.canonicalizeTimezone(secondTimezone);
  }

  /**
   * Get canonical and legacy identifiers that should find a picker option.
   * @param timezone - Canonical or stored timezone identifier
   * @returns {string[]} Search keywords for the canonical picker option
   */
  getTimezoneSearchKeywords(timezone: string): string[] {
    const canonicalTimezone = this.canonicalizeTimezone(timezone);
    const aliases = [...TIMEZONE_PRESENTATION_OVERRIDES.entries()]
      .filter(([, override]) => override.canonicalIdentifier === canonicalTimezone)
      .map(([alias]) => alias);

    return [...new Set([canonicalTimezone, ...aliases])];
  }

  /**
   * Resolve an identifier accepted by the current Intl runtime while keeping
   * canonical identifiers in picker and persistence boundaries.
   */
  private getRuntimeTimezoneIdentifier(timezone: string): string {
    const canonicalTimezone = this.canonicalizeTimezone(timezone);
    const aliases = [...TIMEZONE_PRESENTATION_OVERRIDES.entries()]
      .filter(([, override]) => override.canonicalIdentifier === canonicalTimezone)
      .map(([alias]) => alias);

    if (aliases.length === 0) {
      return canonicalTimezone;
    }

    const candidates = [...new Set([canonicalTimezone, timezone, ...aliases])];
    for (const candidate of candidates) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate });
        return candidate;
      } catch {
        // Try another known identifier for the same timezone.
      }
    }

    return canonicalTimezone;
  }

  /**
   * Get detailed timezone information including offset
   * @returns {TimezoneData[]} Array of timezone data with offset information
   */
  getTimezonesWithOffset(): TimezoneData[] {
    const timezones = this.getTimezones();
    const now = new Date();

    return timezones.map(timezone => {
      const offsetMinutes = this.getTimezoneOffset(timezone, now);
      const offsetString = this.formatOffset(offsetMinutes);
      const isDST = this.isDaylightSavingTime(timezone, now);

      // Create a more readable display name
      const displayName = this.getDisplayName(timezone, offsetString);

      return {
        identifier: timezone,
        displayName,
        offsetMinutes,
        offsetString,
        isDST,
      };
    });
  }

  /**
   * Get timezone offset in minutes for a specific timezone
   * @param timezone - Timezone identifier (e.g., 'Europe/London')
   * @param date - Date to check (optional, defaults to now)
   * @returns {number} Offset in minutes from UTC
   */
  getTimezoneOffset(timezone: string, date: Date = new Date()): number {
    const canonicalTimezone = this.canonicalizeTimezone(timezone);
    if (canonicalTimezone === UTC_TIMEZONE) {
      return 0;
    }
    const runtimeTimezone = this.getRuntimeTimezoneIdentifier(timezone);

    try {
      // Create date formatters for UTC and target timezone
      const utcFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const timezoneFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: runtimeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const utcTime = new Date(utcFormatter.format(date));
      const timezoneTime = new Date(timezoneFormatter.format(date));

      // Calculate difference in minutes
      return Math.round((timezoneTime.getTime() - utcTime.getTime()) / (1000 * 60));
    } catch (error) {
      console.warn(`Failed to get offset for timezone ${timezone}:`, error);
      return 0;
    }
  }

  /**
   * Format offset in minutes to string format (+HH:MM)
   * @param offsetMinutes - Offset in minutes
   * @returns {string} Formatted offset string
   */
  formatOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;

    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Get the user-facing name for a stored timezone identifier.
   * @param timezone - Stored timezone identifier
   * @returns {string} User-facing timezone name
   */
  getTimezoneDisplayName(timezone: string): string {
    return (
      TIMEZONE_PRESENTATION_OVERRIDES.get(timezone)?.displayName ??
      this.canonicalizeTimezone(timezone)
    );
  }

  /**
   * Check if a timezone is currently in daylight saving time
   * @param timezone - Timezone identifier
   * @param date - Date to check (optional, defaults to now)
   * @returns {boolean} Whether timezone is in DST
   */
  isDaylightSavingTime(timezone: string, date: Date = new Date()): boolean {
    if (this.canonicalizeTimezone(timezone) === UTC_TIMEZONE) {
      return false;
    }

    try {
      const january = new Date(date.getFullYear(), 0, 1);
      const july = new Date(date.getFullYear(), 6, 1);

      const januaryOffset = this.getTimezoneOffset(timezone, january);
      const julyOffset = this.getTimezoneOffset(timezone, july);
      const currentOffset = this.getTimezoneOffset(timezone, date);

      // DST is active when current offset is greater than standard offset
      const standardOffset = Math.min(januaryOffset, julyOffset);
      return currentOffset > standardOffset;
    } catch (error) {
      console.warn(`Failed to check DST for timezone ${timezone}:`, error);
      return false;
    }
  }

  /**
   * Get human-readable display name for timezone
   * @param timezone - Timezone identifier
   * @param offsetString - Formatted offset string
   * @returns {string} Display name
   */
  private getDisplayName(timezone: string, offsetString: string): string {
    if (this.canonicalizeTimezone(timezone) === UTC_TIMEZONE) {
      return `${UTC_TIMEZONE} (${offsetString})`;
    }

    const displayTimezone = this.getTimezoneDisplayName(timezone);
    return `${displayTimezone} (${offsetString})`;
  }

  /**
   * Get current browser timezone information
   * @returns {TimezoneData} Browser timezone data
   */
  getBrowserTimezone(): TimezoneData {
    const browserTimezone = this.canonicalizeTimezone(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    const now = new Date();

    const offsetMinutes = this.getTimezoneOffset(browserTimezone, now);
    const offsetString = this.formatOffset(offsetMinutes);
    const isDST = this.isDaylightSavingTime(browserTimezone, now);
    const displayName = this.getDisplayName(browserTimezone, offsetString);

    return {
      identifier: browserTimezone,
      displayName,
      offsetMinutes,
      offsetString,
      isDST,
    };
  }

  /**
   * Get browser offset in minutes (shortcut method)
   * @returns {number} Browser timezone offset in minutes
   */
  getBrowserOffset(): number {
    // Also can use native method: -new Date().getTimezoneOffset()
    return this.getBrowserTimezone().offsetMinutes;
  }
}

// Export a singleton instance of the service
export const timezoneService = new TimezoneService();
