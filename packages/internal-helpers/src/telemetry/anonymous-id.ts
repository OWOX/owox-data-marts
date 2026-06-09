import envPaths from 'env-paths';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AnonymousIdResult {
  /** Stable anonymous id, or null if it could not be read/created. */
  anonymousId: null | string;
  /** True only on the run that first created the id file. */
  isFirstRun: boolean;
}

interface TelemetryFile {
  anonymousId: string;
}

/** Resolve the default app-data directory used to persist the telemetry id. */
function defaultDataDir(): string {
  return envPaths('owox', { suffix: '' }).data;
}

/**
 * Read the persisted anonymous id, or create and persist a new random UUID.
 * Never throws: on any filesystem error returns { anonymousId: null, isFirstRun: false }.
 *
 * @param dataDir - directory to store telemetry.json (defaults to the OS app-data dir).
 */
export function getOrCreateAnonymousId(dataDir?: string): AnonymousIdResult {
  const filePath = join(dataDir ?? defaultDataDir(), 'telemetry.json');

  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as TelemetryFile;
      if (typeof parsed.anonymousId === 'string' && parsed.anonymousId.length > 0) {
        return { anonymousId: parsed.anonymousId, isFirstRun: false };
      }
    }
  } catch {
    // Corrupt/unreadable file — fall through and try to recreate.
  }

  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const anonymousId = randomUUID();
    const file: TelemetryFile = { anonymousId };
    writeFileSync(filePath, JSON.stringify(file), 'utf8');
    return { anonymousId, isFirstRun: true };
  } catch {
    return { anonymousId: null, isFirstRun: false };
  }
}
