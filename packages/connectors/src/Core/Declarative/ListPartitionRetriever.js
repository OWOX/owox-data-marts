/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { runChildSlices } from './partitionChild.js';
import { resolveValueList } from './valueList.js';

/**
 * Retrieves a "list" partition node: slice values come from a static list
 * (literal `values` or a comma-string `valuesFromParameter`); the child request
 * runs once per distinct value with scope.stream_slice[partitionField]. No parent
 * fetch; the orchestrator and pruneToNode are unaffected (same as substream).
 */
export class ListPartitionRetriever {
  constructor({
    requester,
    partitionRouter,
    childRequestSpec,
    childRecordSelector,
    childPagination = null,
    maxPages = 10000,
    maxRows = Infinity,
    maxSlices = Infinity,
  }) {
    this.requester = requester;
    this.partitionRouter = partitionRouter;
    this.childRequestSpec = childRequestSpec;
    this.childRecordSelector = childRecordSelector;
    this.childPagination = childPagination;
    this.maxPages = maxPages;
    this.maxRows = maxRows;
    this.maxSlices = maxSlices;
  }

  async run(scope) {
    const resolved = resolveValueList(this.partitionRouter, scope);
    const seen = new Set();
    const sliceValues = [];
    for (const value of resolved) {
      if (seen.has(value)) continue;
      seen.add(value);
      sliceValues.push(value);
      if (sliceValues.length >= this.maxSlices) break;
    }
    return runChildSlices(
      {
        requester: this.requester,
        sliceValues,
        partitionField: this.partitionRouter.partitionField,
        childRequestSpec: this.childRequestSpec,
        childRecordSelector: this.childRecordSelector,
        childPagination: this.childPagination,
        maxPages: this.maxPages,
        maxRows: this.maxRows,
      },
      scope
    );
  }
}
