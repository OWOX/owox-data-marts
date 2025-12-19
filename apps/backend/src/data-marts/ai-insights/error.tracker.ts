import { ErrorPolicy } from './ai-insights-types';

export class ErrorTracker {
  private readonly seen = new Map<string, number>();
  private total = 0;

  constructor(private readonly policy: ErrorPolicy) {}

  canContinue(): boolean {
    return this.total < this.policy.maxErrorsTotal;
  }

  record(errorMessage: string): { repeated: boolean } {
    this.total += 1;
    const key = canonicalizeError(errorMessage);
    const prev = this.seen.get(key) ?? 0;
    this.seen.set(key, prev + 1);
    return { repeated: prev >= 1 };
  }

  shouldStopBecauseRepeated(repeated: boolean): boolean {
    return this.policy.stopOnRepeatedSameError && repeated;
  }
}

function canonicalizeError(message: string): string {
  return (message || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b0x[0-9a-f]+\b/g, '0xHEX')
    .replace(/\b\d+(\.\d+)?\b/g, 'N'); // normalize numbers to reduce noise
}
