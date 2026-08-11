/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * A storage used ONLY for live-test runs. Instead of writing to a real
 * destination, it prints each record to stdout as a marker-prefixed NDJSON
 * line so the spawning process can collect a sample. Satisfies the minimal
 * AbstractConnector storage interface: constructed with
 * (context, uniqueKeys, fields, destinationName); init()/saveData(data).
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
}
