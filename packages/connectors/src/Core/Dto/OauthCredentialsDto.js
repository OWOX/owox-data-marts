/**
 * OAuth credentials data transfer object
 */
export class OauthCredentialsDto {
  /**
   * @param {Object} credentials - OAuth credentials object
   * @param {Object} credentials.user - User information
   * @param {string} credentials.user.id - User ID
   * @param {string} credentials.user.name - User name
   * @param {Object} credentials.secret - Secret information
   * @param {number} credentials.expiresIn - Expiration time in seconds
   * @param {Object} credentials.additional - Additional information
   */
  constructor(credentials) {
    if (!credentials) {
      throw new Error('OAuth credentials are required');
    }

    this._user = credentials.user || {};
    this._secret = credentials.secret || {};
    this._expiresIn = credentials.expiresIn;
    this._additional = credentials.additional || {};
    this._warnings = credentials.warnings || [];
  }

  /**
   * Get the user information
   * @returns {Object} User information with id and name
   */
  get user() {
    return this._user;
  }

  /**
   * Get the secret information
   * @returns {Object} Secret information
   */
  get secret() {
    return this._secret;
  }

  /**
   * Get the expiration time
   * @returns {number} Expiration time in seconds
   */
  get expiresIn() {
    return this._expiresIn;
  }

  /**
   * Get additional information
   * @returns {Object} Additional information
   */
  get additional() {
    return this._additional;
  }

  /**
   * Convert to plain object
   * @returns {Object} Plain object representation
   */
  toObject() {
    return {
      user: this._user,
      secret: this._secret,
      expiresIn: this._expiresIn,
      additional: this._additional,
      warnings: this._warnings,
    };
  }

  /**
   * Create a new builder instance
   * @returns {OauthCredentialsDtoBuilder} Builder instance
   */
  static builder() {
    return new OauthCredentialsDtoBuilder();
  }
}

/**
 * Builder class for OauthCredentialsDto
 */
class OauthCredentialsDtoBuilder {
  constructor() {
    this._user = {};
    this._secret = {};
    this._expiresIn = null;
    this._additional = {};
    this._warnings = [];
  }

  /**
   * Set user information
   * @param {Object} user - User information
   * @param {string} user.id - User ID
   * @param {string} user.name - User name
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withUser(user) {
    this._user = user || {};
    return this;
  }

  /**
   * Set user ID
   * @param {string} id - User ID
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withUserId(id) {
    if (!this._user) {
      this._user = {};
    }
    this._user.id = id;
    return this;
  }

  /**
   * Set user name
   * @param {string} name - User name
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withUserName(name) {
    if (!this._user) {
      this._user = {};
    }
    this._user.name = name;
    return this;
  }

  /**
   * Set secret information
   * @param {Object} secret - Secret information
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withSecret(secret) {
    this._secret = secret || {};
    return this;
  }

  /**
   * Set expiration time
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withExpiresIn(expiresIn) {
    this._expiresIn = expiresIn;
    return this;
  }

  /**
   * Set additional information
   * @param {Object} additional - Additional information
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withAdditional(additional) {
    this._additional = additional || {};
    return this;
  }

  /**
   * Set warnings
   * @param {string[]} warnings - Warnings
   * @returns {OauthCredentialsDtoBuilder} Builder instance for chaining
   */
  withWarnings(warnings) {
    this._warnings = warnings || [];
    return this;
  }
   
  /**
   * Build and return OauthCredentialsDto instance
   * @returns {OauthCredentialsDto} Built OauthCredentialsDto instance
   */
  build() {
    return new OauthCredentialsDto({
      user: this._user,
      secret: this._secret,
      expiresIn: this._expiresIn,
      additional: this._additional,
    });
  }
}
