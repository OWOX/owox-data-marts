const { StorageType } = require('../../core/types/storage-definitions');

/**
 * Source configuration for data mart runs
 */
class SourceConfig {
  /**
   * @param {Object} config - Source configuration object
   * @param {string} config.name - Name of the source
   * @param {Object} config.config - Source-specific configuration
   */
  constructor(config) {
    if (!config) {
      throw new Error('Source configuration is required');
    }
    if (!config.name) {
      throw new Error('Source name is required');
    }
    if (!config.config) {
      throw new Error('Source config object is required');
    }

    this._name = config.name;
    this._config = Object.fromEntries(
      Object.entries(config.config).map(([key, value]) => [
        key,
        typeof value !== 'object' ? { value: value } : value,
      ])
    );
  }

  /**
   * Get the source name
   * @returns {string} Source name
   */
  get name() {
    return this._name;
  }

  /**
   * Get the source configuration
   * @returns {Object} Source configuration object
   */
  get config() {
    return this._config;
  }

  /**
   * Convert to plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      name: this._name,
      config: this._config,
    };
  }
}

/**
 * Storage configuration for data mart runs
 */
class StorageConfig {
  /**
   * @param {Object} config - Storage configuration object
   * @param {string} config.name - Name of the storage
   * @param {Object} config.config - Storage-specific configuration
   */
  constructor(config) {
    if (!config) {
      throw new Error('Storage configuration is required');
    }
    if (!config.name) {
      throw new Error('Storage name is required');
    }
    if (!config.config) {
      throw new Error('Storage config object is required');
    }
    this._name = this._getStorageName(config.name);
    this._config = Object.fromEntries(
      Object.entries(config.config).map(([key, value]) => [
        key,
        typeof value !== 'object' ? { value: value } : value,
      ])
    );
  }

  /**
   * Get the storage name
   * @param {string} name
   * @returns {string} Storage name
   */
  _getStorageName(name) {
    if (name === StorageType.GOOGLE_BIGQUERY) {
      return 'GoogleBigQuery';
    } else if (name === StorageType.AWS_ATHENA) {
      return 'AwsAthena';
    }
    return name;
  }

  /**
   * Get the storage name
   * @returns {string} Storage name
   */
  get name() {
    return this._name;
  }

  /**
   * Get the storage configuration
   * @returns {Object} Storage configuration object
   */
  get config() {
    return this._config;
  }

  /**
   * Convert to plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      name: this._name,
      config: this._config,
    };
  }
}

/**
 * Main run configuration for data mart operations
 */
class Config {
  /**
   * @param {Object} config - Run configuration object
   * @param {string} config.datamartId - Data mart identifier
   * @param {string} config.name - Name of the run configuration
   * @param {Object} config.source - Source configuration
   * @param {Object} config.storage - Storage configuration
   */
  constructor(config) {
    if (!config) {
      throw new Error('Run configuration is required');
    }
    if (!config.datamartId) {
      throw new Error('Data mart ID is required');
    }
    if (!config.name) {
      throw new Error('Run configuration name is required');
    }
    if (!config.source) {
      throw new Error('Source configuration is required');
    }
    if (!config.storage) {
      throw new Error('Storage configuration is required');
    }

    this._datamartId = config.datamartId;
    this._name = config.name;
    this._source = new SourceConfig(config.source);
    this._storage = new StorageConfig(config.storage);

    this.validate();
  }

  /**
   * Get the source configuration
   * @returns {SourceConfig} Source configuration instance
   */
  get source() {
    return this._source;
  }

  /**
   * Get the storage configuration
   * @returns {StorageConfig} Storage configuration instance
   */
  get storage() {
    return this._storage;
  }

  /**
   * Get the data mart ID
   * @returns {string} Data mart identifier
   */
  get datamartId() {
    return this._datamartId;
  }

  /**
   * Get the run configuration name
   * @returns {string} Run configuration name
   */
  get name() {
    return this._name;
  }

  /**
   * Validate the run configuration
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails
   */
  validate() {
    if (!this._datamartId || typeof this._datamartId !== 'string') {
      throw new Error('Invalid data mart ID');
    }
    if (!this._name || typeof this._name !== 'string') {
      throw new Error('Invalid run configuration name');
    }
    if (!this._source || !(this._source instanceof SourceConfig)) {
      throw new Error('Invalid source configuration');
    }
    if (!this._storage || !(this._storage instanceof StorageConfig)) {
      throw new Error('Invalid storage configuration');
    }
    return true;
  }

  /**
   * Convert to plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      datamartId: this._datamartId,
      name: this._name,
      source: this._source.toObject(),
      storage: this._storage.toObject(),
    };
  }

  /**
   * Create Config from plain object
   * @param {Object} obj - Plain object representation
   * @returns {Config} New Config instance
   */
  static fromObject(obj) {
    return new Config(obj);
  }
}

// CommonJS exports
module.exports = {
  Config,
  SourceConfig,
  StorageConfig,
};
