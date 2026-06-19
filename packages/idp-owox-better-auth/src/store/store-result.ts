import type { AuthFlowParams } from '../utils/request-utils.js';

export enum StoreReason {
  NOT_FOUND = 'not_found',
  EXPIRED = 'expired',
}

/**
 * Wraps PKCE state lookup results with reason metadata.
 */
export class StoreResult {
  private constructor(
    public readonly code: string | null,
    public readonly reason: StoreReason | null,
    public readonly authFlowParams?: AuthFlowParams
  ) {}

  static withCode(code: string, authFlowParams?: AuthFlowParams): StoreResult {
    return new StoreResult(code, null, authFlowParams);
  }
  static notFound(): StoreResult {
    return new StoreResult(null, StoreReason.NOT_FOUND);
  }
  static expired(): StoreResult {
    return new StoreResult(null, StoreReason.EXPIRED);
  }
}
