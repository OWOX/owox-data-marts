export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const size = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);

  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);

    const batchResults = await Promise.all(batch.map((item, j) => fn(item, i + j)));

    batchResults.forEach((value, j) => {
      results[i + j] = value;
    });
  }

  return results;
}
