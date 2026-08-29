/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * A storage used ONLY for live-test runs. Instead of writing to a real
 * destination, it prints each record to stdout as a marker-prefixed NDJSON
 * line so the spawning process can collect a sample.
 *
 * This must implement the WHOLE storage surface AbstractConnector calls, not
 * the part the happy path happens to hit. A live test is not a mock harness:
 * connector-runner hands the real AbstractConnector this class as its
 * StorageClass, so any method the connector calls and this class lacks is a
 * crash in the one run that is supposed to prove a manifest works before it is
 * published. That surface is closed and small -- grep `storage.` in
 * AbstractConnector.js -- and is, in full:
 *
 *   constructor(context, uniqueKeys, fields, destinationName)  getStorageForNode
 *   init()                                                     _writeBatch
 *   saveData(data)                                             _writeBatch
 *   replaceData(data)                                          processFullRefreshNode
 *
 * Everything else on AbstractStorage (getColumnType, getSelectedFields,
 * saveRecordsAddedToBuffer, hasSameSchema, ...) is called by storages on
 * themselves, never by the connector, so it has nothing to do here.
 *
 * Deliberately does NOT extend AbstractStorage, for two reasons:
 *
 *  1. It would not help. Every method AbstractStorage leaves unimplemented
 *     throws -- its replaceData() throws "does not support full-refresh table
 *     replacement" -- so inheriting would trade "replaceData is not a function"
 *     for a different exception on the same line, not fix it. Only an actual
 *     implementation makes the live test work.
 *  2. It would break the case that needs it most. AbstractStorage's constructor
 *     throws when uniqueKeyColumns is empty, and a full-refresh node replaces
 *     its whole table and so declares no unique key (DeclarativeSource defaults
 *     uniqueKeys to []). It also calls context.registerParameters(), which this
 *     class is constructed too cheaply to depend on.
 */
import { TEST_ROW_MARKER } from '../Constants/CommonConstants.js';
export { TEST_ROW_MARKER };

export class TestStorage {
  constructor(context, uniqueKeys, fields, destinationName) {
    this.context = context;
    this.uniqueKeys = uniqueKeys;
    this.fields = fields;
    this.destinationName = destinationName;
  }

  async init() {}

  async saveData(data) {
    for (const row of data) {
      process.stdout.write(`${TEST_ROW_MARKER}${JSON.stringify(row)}\n`);
    }
  }

  /**
   * Full-refresh nodes (`isFullRefresh: true`) publish their snapshot through
   * this instead of saveData(). For a real storage the difference is
   * destructive -- it truncates and swaps the destination table. A live test
   * has no destination table, and the sample the builder shows is just "the
   * rows this node produced", so replacing and appending are the same
   * observable act here. Delegating rather than repeating the write keeps the
   * two from drifting apart.
   */
  async replaceData(data) {
    await this.saveData(data);
  }
}
