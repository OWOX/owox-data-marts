export interface BaseException {
  readonly message: string;
  readonly errorDetails?: Record<string, unknown>;
}
