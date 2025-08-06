/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var AbstractRunConfig = class AbstractRunConfig {

  constructor(runConfigData = null) {
    if (!runConfigData) {
      this.type = RUN_CONFIG_TYPE.INCREMENTAL;
    } else {
      this.type = runConfigData.type || RUN_CONFIG_TYPE.INCREMENTAL;
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
    if (this.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
      this._validateManualBackfill(config);
      this._transformManualBackfillData(config);
    } else if (this.type !== RUN_CONFIG_TYPE.INCREMENTAL) {
      throw new Error(`Unknown RunConfig type: ${this.type}`);
    }
    
    return true;
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
      if (!configParam.attributes || !configParam.attributes.includes(CONFIG_ATTRIBUTES.MANUAL_BACKFILL)) {
        throw new Error(`Config field '${item.configField}' does not support manual backfill`);
      }
    }
    
    return true;
  }

  /**
   * Transforms manual backfill data to the correct type if it's a string
   * @param {AbstractConfig} config - The connector configuration
   * @private
   */
  _transformManualBackfillData(config) {
    for (const item of this.data) {
      let configField = config[item.configField];
      if (configField.requiredType === 'date' && typeof item.value === 'string') {
        item.value = new Date(item.value);
      }
    }
  }
};
