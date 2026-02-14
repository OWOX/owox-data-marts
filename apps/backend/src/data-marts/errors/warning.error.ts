/**
 * Custom error class for errors that should be logged at WARNING level
 * instead of ERROR level.
 *
 * These errors still fail the report (they are re-thrown), but they represent
 * expected/recoverable situations like a deleted sheet or spreadsheet,
 * rather than unexpected system failures.
 *
 * Usage:
 *   throw new Warning('Sheet not found');
 *
 * Detection:
 *   if (error instanceof Warning) { logger.warn(...) }
 */
export class Warning extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Warning';
  }
}
