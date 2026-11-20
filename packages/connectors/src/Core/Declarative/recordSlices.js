/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Each child record keeps the slice it came from, for transformations.add; never a key of the record.
// The link is by object identity: a step between the retriever and Transformer must not copy records.
const recordSlices = new WeakMap();
const isLinkable = record => record !== null && typeof record === 'object';

export const sliceOf = record => (isLinkable(record) ? recordSlices.get(record) : undefined);

export function linkSlice(records, slice) {
  for (const record of records) if (isLinkable(record)) recordSlices.set(record, slice);
}
