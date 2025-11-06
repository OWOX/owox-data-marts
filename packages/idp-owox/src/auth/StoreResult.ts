export enum StoreReason {
  NOT_FOUND = 'not_found',
  EXPIRED = 'expired',
}

export class StoreResult {
  code: string | null;
  reason: StoreReason | null;

  static withCode(code: string): StoreResult {
    return { code, reason: null };
  }
  static notFound(): StoreResult {
    return { code: null, reason: StoreReason.NOT_FOUND };
  }
  static expired(): StoreResult {
    return { code: null, reason: StoreReason.EXPIRED };
  }
}
