/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const MicrosoftAdsHelper = {
  /**
   * Parse fields string into a structured object
   * @param {string} fieldsString - Fields string in format "nodeName fieldName, nodeName fieldName"
   * @return {Object} Object with node names as keys and arrays of field names as values
   */
  parseFields(fieldsString) {
    return fieldsString.split(", ").reduce((acc, pair) => {
      let [key, value] = pair.split(" ");
      (acc[key] = acc[key] || []).push(value.trim());
      return acc;
    }, {});
  },

  /**
   * Poll the given URL until the provided isDone callback returns true, or until 30 minutes have elapsed
   * @param {Object} opts
   * @param {string} opts.url
   * @param {Object} opts.options
   * @param {function(Object): boolean} opts.isDone
   * @param {number} [opts.interval=5000]
   * @returns {Object}
   */
  async pollUntilStatus({ url, options, isDone, interval = 5000 }) {
    const startTime = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes in ms
    let statusResult;

    try {
      do {
        if (Date.now() - startTime > timeout) {
          throw new Error('Polling timed out after 30 minutes');
        }
        const response = await HttpUtils.fetch(url, options);
        const text = await response.getContentText();
        statusResult = JSON.parse(text);

        // Only delay if we need to poll again
        if (!isDone(statusResult)) {
          await AsyncUtils.delay(interval);
        }
      } while (!isDone(statusResult));

      return statusResult;
    } catch (error) {
      if (statusResult) {
        throw new Error(`${error.message}\nAPI Response: ${JSON.stringify(statusResult, null, 2)}`);
      }
      throw error;
    }
  },

  /**
   * Download, unzip and parse CSV rows from the given URL
   * @param {string} url
   * @returns {Array<Array<string>>}
   */
  async downloadCsvRows(url) {
    const response = await HttpUtils.fetch(url);
    const blob = await response.getBlob();
    const files = FileUtils.unzip(blob);
    let allRows = [];
    files.forEach(file => {
      const csvText = file.getDataAsString();
      const rows = FileUtils.parseCsv(csvText);
      allRows = allRows.concat(rows);
    });
    return allRows;
  },

  /**
   * Download and unzip a CSV file, converting rows to objects in chunks that are
   * flushed to the callback as soon as they fill up. Unlike downloadCsvRows +
   * csvRowsToObjects, this never builds the full cell-array or record-object
   * arrays. Peak memory is one file's CSV text plus its split line strings
   * (V8 slices sharing the parent string's memory) plus one chunk of records.
   * @param {string} url
   * @param {function(Array<Object>): Promise<void>} onRecordsChunk
   * @param {number} [chunkSize=2000]
   * @returns {Promise<void>}
   */
  async processCsvRecordsFromUrl(url, onRecordsChunk, chunkSize = 2000) {
    const response = await HttpUtils.fetch(url);
    const blob = await response.getBlob();
    const files = FileUtils.unzip(blob);
    for (const file of files) {
      await this.processCsvTextInChunks(file.getDataAsString(), onRecordsChunk, chunkSize);
    }
  },

  /**
   * Convert CSV text to record objects chunk by chunk. The first non-empty line is
   * the header (sanitized like csvRowsToObjects); 'Format Version' rows are skipped.
   * @param {string} csvText
   * @param {function(Array<Object>): Promise<void>} onRecordsChunk
   * @param {number} [chunkSize=2000]
   * @returns {Promise<void>}
   */
  async processCsvTextInChunks(csvText, onRecordsChunk, chunkSize = 2000) {
    const lines = csvText.split('\n');
    let headerNames = null;
    let chunk = [];

    for (const line of lines) {
      if (line.trim() === '') continue;
      const rowValues = FileUtils.parseCsv(line)[0];

      if (headerNames === null) {
        headerNames = rowValues.map(rawHeader => rawHeader.replace(/[^a-zA-Z0-9]/g, ''));
        continue;
      }
      if (rowValues[0] === 'Format Version') continue;

      const record = {};
      headerNames.forEach((headerName, colIndex) => {
        record[headerName] = rowValues[colIndex];
      });
      chunk.push(record);

      if (chunk.length >= chunkSize) {
        await onRecordsChunk(chunk);
        chunk = [];
      }
    }

    if (chunk.length > 0) {
      await onRecordsChunk(chunk);
    }
  },

  /**
   * Convert a 2D array of CSV rows into an array of objects
   * @param {Array<Array<string>>} csvRows
   * @returns {Array<Object>}
   */
  csvRowsToObjects(csvRows) {
    const filteredRows = csvRows.filter((row, idx) => idx === 0 || row[0] !== 'Format Version');
    const headerNames = filteredRows[0].map(rawHeader => rawHeader.replace(/[^a-zA-Z0-9]/g, ''));
    return filteredRows.slice(1).map(rowValues => {
      const record = {};
      headerNames.forEach((headerName, colIndex) => {
        record[headerName] = rowValues[colIndex];
      });
      return record;
    });
  },

  /**
   * Filter data to include only specified fields
   * @param {Array<Object>} data
   * @param {Array<string>} fields
   * @returns {Array<Object>}
   */
  filterByFields(data, fields) {
    if (!fields.length) return data;
    return data.map(record => {
      const filteredRecord = {};
      fields.forEach(fieldName => {
        if (fieldName in record) {
          filteredRecord[fieldName] = record[fieldName];
        }
      });
      return filteredRecord;
    });
  },

  /**
   * Extract campaign IDs from records
   * @param {Array<Object>} allRecords - Array of records to extract campaigns from
   * @returns {Array<string>} Array of campaign IDs
   */
  extractCampaignIds(allRecords) {
    const campaigns = allRecords.filter(record => {
      const type = record.Type || record.RecordType || '';
      const status = record.Status || record.CampaignStatus || '';
      return type === 'Campaign' && status !== 'Deleted';
    });

    return campaigns.map(campaign => campaign.Id);
  }
};
