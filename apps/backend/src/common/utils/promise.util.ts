/**
 * Races a promise against a timeout.  If the timeout fires first the returned
 * promise rejects with an `Error` whose message begins with `"Timed out after"`.
 * The internal timer is always cleared once either side settles, so there are no
 * dangling Node handles.
 *
 * @param promise   The promise to race.
 * @param timeoutMs How long to wait before rejecting.
 * @param label     Human-readable description included in the timeout error message.
 */
export function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${String(timeoutMs)}ms: ${label}`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
