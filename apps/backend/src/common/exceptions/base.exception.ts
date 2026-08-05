export interface BaseException {
  readonly message: string;
  readonly errorDetails?: Record<string, unknown>;
  /**
   * Stable, machine-readable identifier for the failure, e.g. `PLUGIN_SUSPENDED`.
   * Clients branch on this instead of matching human-readable messages.
   */
  readonly code?: string;
}
