import type { PropsWithChildren } from 'react';

/**
 * Temporary provider stub for the new Insights module.
 * Kept minimal to unblock routing while a new context is implemented.
 */
export function InsightsProvider({ children }: PropsWithChildren) {
  return children;
}
