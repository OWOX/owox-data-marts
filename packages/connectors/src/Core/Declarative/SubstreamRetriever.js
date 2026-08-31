/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { SyncRetriever } from './SyncRetriever.js';
import { Paginator } from './Paginator.js';
import { RecordSelector } from './RecordSelector.js';
import { getPath } from './pathUtils.js';
import { runChildSlices } from './partitionChild.js';

/**
 * Retrieves a "substream" node. The parent slice-producer (inline in
 * partitionRouter) is fetched to produce distinct non-null key values; the child
 * request then runs once per key (see runChildSlices). The parent is NOT a
 * separate node, so the orchestrator and pruneToNode are unaffected.
 */
export class SubstreamRetriever {
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
    const parent = this.partitionRouter.parent;
    const sliceProducer = new SyncRetriever({
      requester: this.requester,
      recordSelector: new RecordSelector({ recordPath: parent.recordPath || [] }),
      requestSpec: parent.request,
      paginator: new Paginator(parent.pagination || { type: 'none' }),
      maxPages: this.maxPages,
      maxRows: Infinity,
    });
    const parentRecords = await sliceProducer.run(scope);

    const keyPath = String(parent.key).split('.');
    const seen = new Set();
    const sliceValues = [];
    for (const record of parentRecords) {
      const value = getPath(record, keyPath);
      if (value === undefined || value === null || seen.has(value)) continue;
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
