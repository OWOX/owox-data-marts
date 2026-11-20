/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { SyncRetriever } from './SyncRetriever.js';
import { Paginator } from './Paginator.js';

/**
 * Runs the child request once per slice value with the value exposed as
 * scope.stream_slice[partitionField], concatenating all child records. A fresh
 * Paginator is built per slice (Paginator is stateful). Stops once total records
 * reach maxRows. Shared by SubstreamRetriever and ListPartitionRetriever.
 * With onSlice, slices startAt.. are handed to `await onSlice(records, index)`
 * one by one instead of being collected, and the result is [].
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
  scope,
  { startAt = 0, onSlice } = {}
) {
  // Collected per slice and flattened once, never `all.push(...records)`: a
  // single slice can return a bulk page (csv/jsonl decode a whole file into one
  // flat array), and spreading it would blow V8's argument limit with
  // "RangeError: Maximum call stack size exceeded". Same idiom as SyncRetriever
  // and AbstractConnector.processFullRefreshNode.
  const batches = [];
  let total = 0;
  for (let i = startAt; i < sliceValues.length; i++) {
    const value = sliceValues[i];
    if (total >= maxRows) break;
    const childScope = { ...scope, stream_slice: { [partitionField]: value } };
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
    if (onSlice) {
      await onSlice(records, i);
      total += records.length;
    } else if (records.length > 0) {
      batches.push(records);
      total += records.length;
    }
  }
  if (onSlice) return [];
  return batches.length === 1 ? batches[0] : batches.flat();
}
