/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var LinkedInAdsConnector = class LinkedInAdsConnector extends AbstractConnector {
  constructor(config, source, storageName = "GoogleBigQueryStorage", runConfig = null) {
    super(config, source, null, runConfig);

    this.storageName = storageName;
  }

  /**
   * Main method - entry point for the import process
   * Processes all nodes defined in the fields configuration
   */
  async startImportProcess() {
    const urns = FormatUtils.parseIds(this.config.AccountURNs.value, {prefix: 'urn:li:sponsoredAccount:'});
    const fields = FormatUtils.parseFields(this.config.Fields.value);
    const nodeNames = Object.keys(fields);
    const isTimeSeries = nodeName => ConnectorUtils.isTimeSeriesNode(this.source.fieldsSchema[nodeName]);
    const timeSeriesNodes = nodeNames.filter(isTimeSeries);
    const catalogNodes = nodeNames.filter(nodeName => !isTimeSeries(nodeName));

    for (const nodeName of catalogNodes) {
      for (const urn of urns) {
        await this.processCatalogNode({
          nodeName,
          urn,
          fields: fields[nodeName] || []
        });
      }
    }

    await this.processTimeSeriesNodes({ urns, timeSeriesNodes, fields });
  }

  /**
   * Imports every time series node for every account, one date at a time.
   *
   * The loop is date-outer on purpose: the incremental cursor may only move once a
   * date is complete for *all* accounts and nodes, so a run interrupted midway
   * resumes from the last fully imported date instead of restarting the range.
   * It also keeps memory bounded to one day of analytics instead of the whole range.
   *
   * @param {Object} options - Processing options
   * @param {Array<string>} options.urns - Account URNs to import
   * @param {Array<string>} options.timeSeriesNodes - Names of the time series nodes to import
   * @param {Object} options.fields - Map of node name to the fields selected for it
   */
  async processTimeSeriesNodes({ urns, timeSeriesNodes, fields }) {
    if (!timeSeriesNodes.length) {
      return;
    }

    const [startDate, daysToFetch] = this.getStartDateAndDaysToFetch();

    if (daysToFetch <= 0) {
      this.config.logMessage('No days to fetch for time series data');
      return;
    }

    for (let dayOffset = 0; dayOffset < daysToFetch; dayOffset++) {
      // UTC arithmetic: start dates are UTC midnight, so this never drifts across DST
      // and the day fetched, logged and checkpointed is the same calendar day.
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + dayOffset);

      for (const nodeName of timeSeriesNodes) {
        for (const urn of urns) {
          await this.processTimeSeriesDay({
            nodeName,
            urn,
            date,
            fields: fields[nodeName] || []
          });
        }
      }

      // Every account and node stored this date, so the cursor can move past it.
      if (this.runConfig.type === RUN_CONFIG_TYPE.INCREMENTAL) {
        this.config.updateLastRequstedDate(date);
      }
    }

    this.reportTruncatedAnalytics();
  }

  /**
   * Emit one warning per account for the days whose adAnalytics response hit LinkedIn's
   * element cap. The Source records them per call; reporting here keeps a saturated
   * account to a single warning per run instead of one warning per day.
   */
  reportTruncatedAnalytics() {
    for (const [urn, days] of Object.entries(this.source.truncatedAnalyticsDays)) {
      this.config.addWarningToCurrentStatus(this.source.buildTruncationWarning(urn, days));
    }
  }

  /**
   * Fetch and store a single day of a time series node for one account
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.urn - Account URN
   * @param {Date} options.date - The day to import
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processTimeSeriesDay({ nodeName, urn, date, fields }) {
    const formattedDate = DateUtils.formatDate(date);

    this.config.logMessage(`Start importing data for ${formattedDate}: ${urn}/${nodeName}`);

    const data = await this.source.fetchData(nodeName, urn, { fields, startDate: date, endDate: date });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${urn} on ${formattedDate}` : `No records have been fetched`);

    await this.saveNodeData({ nodeName, fields, data });
  }

  /**
   * Fetch and store a catalog node (e.g. adCampaigns, creatives) for one account
   * @param {Object} options - Processing options
   * @param {string} options.nodeName - Name of the node
   * @param {string} options.urn - Account URN
   * @param {Array<string>} options.fields - Array of fields to fetch
   */
  async processCatalogNode({ nodeName, urn, fields }) {
    const data = await this.source.fetchData(nodeName, urn, { fields });

    this.config.logMessage(data.length ? `${data.length} rows of ${nodeName} were fetched for ${urn}` : `No records have been fetched`);

    await this.saveNodeData({ nodeName, fields, data });
  }

  /**
   * Save fetched rows to the node's storage, creating an empty table when configured to
   * @param {Object} options - Save options
   * @param {string} options.nodeName - Name of the node
   * @param {Array<string>} options.fields - Fields selected for the node
   * @param {Array} options.data - Fetched rows
   */
  async saveNodeData({ nodeName, fields, data }) {
    if (!data.length && !this.config.CreateEmptyTables?.value) {
      return;
    }

    const preparedData = data.length ? this.addMissingFieldsToData(data, fields) : data;
    const storage = await this.getStorageByNode(nodeName);
    await storage.saveData(preparedData);
  }

  /**
   * Get or create storage instance for a node
   * @param {string} nodeName - Name of the node
   * @returns {Object} - Storage instance
   */
  async getStorageByNode(nodeName) {
    // initiate blank object for storages
    if (!("storages" in this)) {
      this.storages = {};
    }

    if (!(nodeName in this.storages)) {
      if (!("uniqueKeys" in this.source.fieldsSchema[nodeName])) {
        throw new Error(`Unique keys for '${nodeName}' are not defined in the fields schema`);
      }

      let uniqueFields = this.source.fieldsSchema[nodeName]["uniqueKeys"];

      this.storages[nodeName] = new globalThis[this.storageName](
        this.config.mergeParameters({
          DestinationSheetName: { value: this.source.fieldsSchema[nodeName].destinationName },
          DestinationTableName: { value: this.getDestinationName(nodeName, this.config, this.source.fieldsSchema[nodeName].destinationName) },
        }),
        uniqueFields,
        this.source.fieldsSchema[nodeName]["fields"],
        `${this.source.fieldsSchema[nodeName]["description"]} ${this.source.fieldsSchema[nodeName]["documentation"]}`
      );

      await this.storages[nodeName].init();
    }

    return this.storages[nodeName];
  }

};
