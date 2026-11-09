/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const MicrosoftAdsHelper = {
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GET_USER_URL: 'https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/User/Query',
  // GetUser only names the user at sign-in; a slow answer must not hold the sign-in up.
  GET_USER_TIMEOUT_MS: 10000,

  /**
   * A Credential signed in with Google stores a Google OAuth client ID, which always ends
   * with `.apps.googleusercontent.com`; a Microsoft (Entra) client ID is a GUID.
   * @param {string} clientId
   * @returns {boolean}
   */
  isGoogleClientId(clientId) {
    return typeof clientId === 'string' && clientId.trim().endsWith('.apps.googleusercontent.com');
  },

  /**
   * Error 126 IdentityTypeMismatch: the token comes from a different sign-in type (Microsoft
   * or Google) than the one the Microsoft Advertising user signs in with.
   * @param {Object} payload - Parsed error body of a Microsoft Advertising API response
   * @returns {boolean}
   */
  isIdentityTypeMismatch(payload) {
    return MicrosoftAdsHelper.apiErrors(payload).some(
      error => Number(error?.Code) === 126 || error?.ErrorCode === 'IdentityTypeMismatch'
    );
  },

  /**
   * The errors of a Microsoft Advertising API response: a fault's `Errors` and an operation's
   * `OperationErrors`.
   * @param {Object} payload - Parsed body of a Microsoft Advertising API response
   * @returns {Array<Object>}
   */
  apiErrors(payload) {
    return [payload?.Errors, payload?.OperationErrors].flatMap(errors =>
      Array.isArray(errors) ? errors : []
    );
  },

  /**
   * The first error of a Microsoft Advertising API response as one readable line, such as
   * `Authentication failed. (105 InvalidCredentials)`.
   * @param {Object} payload - Parsed body of a Microsoft Advertising API response
   * @returns {string|null}
   */
  apiErrorMessage(payload) {
    const [error] = MicrosoftAdsHelper.apiErrors(payload);
    if (!error?.Message) return null;
    const code = [error.Code, error.ErrorCode].filter(Boolean).join(' ');
    return code ? `${error.Message} (${code})` : error.Message;
  },

  /**
   * What the user should do when Microsoft Advertising rejects the sign-in type of a Credential.
   * Error 126 names the sign-in type the user needs (GoogleAccountIsRequired,
   * PersonalAccountIsRequired, WorkAccountIsRequired) when it says it at all.
   * @param {Object} payload - Parsed error body with error 126
   * @param {boolean} signedInWithGoogle - The Credential was signed in with Google
   * @param {boolean} atRun - The Credential already exists and a run hit the error
   * @returns {string}
   */
  identityTypeMismatchMessage(payload, signedInWithGoogle, atRun) {
    const reasons = JSON.stringify(MicrosoftAdsHelper.apiErrors(payload));
    let signsInWith;
    let action;
    if (reasons.includes('GoogleAccountIsRequired')) {
      signsInWith = 'with Google';
      action = 'Sign in with Google';
    } else if (reasons.includes('PersonalAccountIsRequired')) {
      signsInWith = 'with a personal Microsoft account';
      action = 'Sign in with Microsoft and choose the personal account';
    } else if (reasons.includes('WorkAccountIsRequired')) {
      signsInWith = 'with a work or school Microsoft account';
      action = 'Sign in with Microsoft and choose the work or school account';
    } else if (signedInWithGoogle) {
      signsInWith = 'with a Microsoft account, not with Google';
      action = 'Sign in with Microsoft';
    } else {
      signsInWith =
        'with another account type: Google, or the other Microsoft account (work or personal) of this email';
      action = 'Sign in with Google, or Sign in with Microsoft with the other account';
    }
    const reason = `This Microsoft Advertising user signs in ${signsInWith}.`;
    return atRun
      ? `Microsoft Advertising rejected the Credential (error 126 IdentityTypeMismatch). ${reason} Reconnect the Credential: ${action}.`
      : `${reason} Use ${action}.`;
  },

  /**
   * @param {Object} payload - Parsed error body of a Microsoft Advertising API response
   * @returns {boolean}
   */
  isInvalidCredentials(payload) {
    return MicrosoftAdsHelper.apiErrors(payload).some(error => Number(error?.Code) === 105);
  },

  /**
   * How the "Connected as" line names the Microsoft Advertising user from GetUser.
   * @param {Object} user - `User` of a GetUser response
   * @returns {{id: string, name: string}}
   */
  describeUser(user) {
    const fullName = [user?.Name?.FirstName, user?.Name?.LastName].filter(Boolean).join(' ');
    return {
      id: user?.Id != null ? String(user.Id) : 'unknown',
      name: user?.ContactInfo?.Email || fullName || user?.UserName || 'Microsoft Ads User',
    };
  },

  /**
   * Parse fields string into a structured object
   * @param {string} fieldsString - Fields string in format "nodeName fieldName, nodeName fieldName"
   * @return {Object} Object with node names as keys and arrays of field names as values
   */
  parseFields(fieldsString) {
    return fieldsString.split(', ').reduce((acc, pair) => {
      let [key, value] = pair.split(' ');
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
        const response = await fetch(url, options);
        const text = await response.text();
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
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const blob = Buffer.from(arrayBuffer);
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
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const blob = Buffer.from(arrayBuffer);
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
  },
};
