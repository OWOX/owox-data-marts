/**
 * Wrap a promise with a timeout. If the promise does not settle within the given time,
 * the function resolves with the provided fallback value.
 *
 * Note: This does not cancel the underlying operation; it only ignores its eventual result.
 * If cancellation is required, the callee must support AbortSignal or similar.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  // Create a timeout promise that resolves with the fallback value
  const timeoutPromise = new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    // If the main promise settles first, clear the timer to avoid unnecessary work
    promise
      .finally(() => clearTimeout(timer))
      .catch(() => {
        /* ignore */
      });
  });

  // Race the original promise against the timeout
  return Promise.race([promise, timeoutPromise]);
}
