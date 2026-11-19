/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { SyncRetriever } from './SyncRetriever.js';
import { Paginator } from './Paginator.js';

// Each child record keeps the slice it came from, for transformations.add; never a key of the record.
const recordSlices = new WeakMap();
const isLinkable = record => record !== null && typeof record === 'object';
export const sliceOf = record => (isLinkable(record) ? recordSlices.get(record) : undefined);

/**
 * Runs the child request once per slice value with the value exposed as
 * scope.stream_slice[partitionField], concatenating all child records. A fresh
 * Paginator is built per slice (Paginator is stateful). Stops once total records
 * reach maxRows. Shared by SubstreamRetriever and ListPartitionRetriever.
 */
export async function runChildSlices(
  {
    requester,
    sliceValues,
    partitionField,
    childRequestSpec,
    childRecordSelector,
    childPagination = null,
    maxPages,
    maxRows = Infinity,
    context = null,
  },
  scope
) {
  // Collected per slice and flattened once, never `all.push(...records)`: a
  // single slice can return a bulk page (csv/jsonl decode a whole file into one
  // flat array), and spreading it would blow V8's argument limit with
  // "RangeError: Maximum call stack size exceeded". Same idiom as SyncRetriever
  // and AbstractConnector.processFullRefreshNode.
  const batches = [];
  let total = 0;
  for (const value of sliceValues) {
    if (total >= maxRows) break;
    const slice = { [partitionField]: value };
    const childScope = { ...scope, stream_slice: slice };
    const child = new SyncRetriever({
      requester,
      recordSelector: childRecordSelector,
      requestSpec: childRequestSpec,
      paginator: new Paginator(childPagination || { type: 'none' }),
      maxPages,
      maxRows: maxRows - total,
      context,
    });
    const records = await child.run(childScope);
    for (const record of records) if (isLinkable(record)) recordSlices.set(record, slice);
    if (records.length > 0) {
      batches.push(records);
      total += records.length;
    }
  }
  return batches.length === 1 ? batches[0] : batches.flat();
}
