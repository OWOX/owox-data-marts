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
    public readonly reason: StoreReason | null
  ) {}

  static withCode(code: string): StoreResult {
    return new StoreResult(code, null);
  }
  static notFound(): StoreResult {
    return new StoreResult(null, StoreReason.NOT_FOUND);
  }
  static expired(): StoreResult {
    return new StoreResult(null, StoreReason.EXPIRED);
  }
}
