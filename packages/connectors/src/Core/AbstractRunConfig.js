/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var RunConfigType = {
  INCREMENTAL: 'incremental',
  MANUAL_BACKFILL: 'manualBackfill'
};

var AbstractRunConfig = class AbstractRunConfig {

  constructor(runConfigData = null) {
    if (!runConfigData) {
      this.type = RunConfigType.INCREMENTAL;
    } else {
      this.type = runConfigData.type || RunConfigType.INCREMENTAL;
      this.data = runConfigData.data || [];
      this.state = runConfigData.state || {};
    }
  }

  /**
   * Validates the run config against the connector configuration
   * @param {AbstractConfig} config - The connector configuration
   * @throws {Error} If validation fails
   */
  validate(config) {
    if (this.type === RunConfigType.MANUAL_BACKFILL) {
      this._validateManualBackfill(config);
    } else if (this.type !== RunConfigType.INCREMENTAL) {
      throw new Error(`Unknown RunConfig type: ${this.type}`);
    }
  }

  /**
   * Validates manual backfill configuration
   * @param {AbstractConfig} config - The connector configuration
   * @private
   */
  _validateManualBackfill(config) {
    if (!Array.isArray(this.data)) {
      throw new Error('Manual backfill data must be an array');
    }

    for (const item of this.data) {
      if (!item.configField || item.value === undefined) {
        throw new Error('Each manual backfill item must have configField and value');
      }

      // Check if the field exists in config
      if (!(item.configField in config)) {
        throw new Error(`Config field '${item.configField}' does not exist`);
      }

      // Check if the field supports manual backfill
      const configParam = config[item.configField];
      if (!configParam.attributes || !configParam.attributes.includes('manualBackfill')) {
        throw new Error(`Config field '${item.configField}' does not support manual backfill`);
      }

      // Type validation will be done by config.validate() after _processRunConfig()
    }
  }

  /**
   * Creates a manual backfill run config
   * @param {Array} params - Array of parameter objects with configField and value
   * @returns {AbstractRunConfig} New run config instance
   */
  static createManualBackfill(params) {
    // params is already an array of {configField, value} objects
    return new AbstractRunConfig({
      type: RunConfigType.MANUAL_BACKFILL,
      data: params
    });
  }

  /**
   * Creates an incremental run config
   * @param {Object} state - State object (optional, for future use)
   * @returns {AbstractRunConfig} New run config instance
   */
  static createIncremental(state = {}) {
    return new AbstractRunConfig({
      type: RunConfigType.INCREMENTAL,
      state
    });
  }
}; 