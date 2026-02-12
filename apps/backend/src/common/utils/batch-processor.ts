/**
 * Processes an array of items in batches, applying an asynchronous processor function to each item.
 *
 * @param {T[]} items - The array of items to be processed.
 * @param {(item: T) => Promise<R>} processor - An asynchronous function that processes a single item and returns a result.
 * @param {number} [batchSize=10] - The number of items to process in each batch. Defaults to 10.
 * @return {Promise<R[]>} A promise that resolves to an array of results after processing all items.
 */
export async function processBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
}
