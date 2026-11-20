import { isViewOnlyPayload, type Payload } from '@owox/idp-protocol';
import { castError } from '@owox/internal-helpers';
import type { Request, Response } from 'express';
import { createServiceLogger } from '../../core/logger.js';
import type { DatabaseStore } from '../../store/database-store.js';
import { getCookie } from '../../utils/request-utils.js';

export interface ProductIntentConfig {
  cookiePrefix: string;
  cookieDomain: string;
}

export interface UserSignalView {
  name: string;
  value: Record<string, string>;
  origin: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
}

const SIGNAL_NAME = 'product_intent';
const SIGNAL_ORIGIN = 'explicit_click';
// In this order: the value is serialized with its keys in it.
const INTENT_PARTS = ['destination', 'source', 'storage'];

const PART_VALUE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PART_MAX_LENGTH = 64;

/**
 * Records the product intent a user arrived with, carried by cookies named
 * `<prefix><part>`, as one signal of that user, and clears those cookies.
 *
 * Off unless configured. Nothing is recorded for a view-only session or a
 * request without a user. An intent with an invalid part is dropped whole.
 * Cookies are kept when recording fails, so the next request tries again.
 * Failures are only logged, never thrown, and cookie values are never logged.
 */
export class UserSignalsService {
  private readonly logger = createServiceLogger(UserSignalsService.name);

  constructor(
    private readonly config: ProductIntentConfig | undefined,
    private readonly store: DatabaseStore
  ) {}

  /** Never throws. */
  async collect(req: Request, res: Response, payload: Payload | null | undefined): Promise<void> {
    const config = this.config;
    if (!config || !payload?.userId || isViewOnlyPayload(payload)) return;
    try {
      const present: string[] = [];
      const value: Record<string, string> = {};
      let valid = true;
      for (const part of INTENT_PARTS) {
        const name = `${config.cookiePrefix}${part}`;
        const raw = getCookie(req, name);
        if (raw === undefined) continue;
        present.push(name);
        if (raw.length <= PART_MAX_LENGTH && PART_VALUE.test(raw)) value[part] = raw;
        else valid = false;
      }
      if (present.length === 0) return;

      if (valid) {
        await this.store.recordUserSignal({
          userId: payload.userId,
          name: SIGNAL_NAME,
          origin: SIGNAL_ORIGIN,
          value: JSON.stringify(value),
        });
      }
      for (const name of present) {
        res.clearCookie(name, { domain: config.cookieDomain, path: '/' });
      }
    } catch (error) {
      this.logger.warn('User signal not recorded', { error: castError(error).message });
    }
  }

  /** `undefined` when the feature is off or the read failed. */
  async list(userId: string): Promise<UserSignalView[] | undefined> {
    if (!this.config) return undefined;
    try {
      const views: UserSignalView[] = [];
      for (const signal of await this.store.getUserSignals(userId)) {
        const value = parseValue(signal.value);
        if (!value) continue;
        views.push({
          name: signal.name,
          value,
          origin: signal.origin,
          firstSeenAt: signal.firstSeenAt,
          lastSeenAt: signal.lastSeenAt,
          seenCount: signal.seenCount,
        });
      }
      return views;
    } catch (error) {
      this.logger.warn('User signals not read', { error: castError(error).message });
      return undefined;
    }
  }
}

function parseValue(raw: string): Record<string, string> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // not a JSON object; the row is skipped
  }
  return undefined;
}
