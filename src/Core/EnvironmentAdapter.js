/**
 * @typedef {Object} FetchResponse
 * @property {function(): Object} getHeaders
 * @property {function(): any} getAsJson
 * @property {function(): string|Buffer} getContent
 * @property {function(): string} getContentText
 * @property {function(): number} getResponseCode
 */

/**
 * Environment adapter class that provides a unified interface for environment-specific operations.
 * This class abstracts away differences between Google Apps Script and Node.js environments,
 * allowing code to work consistently across both platforms.
 * 
 * Key features:
 * - Environment detection and validation
 * - Unified HTTP request handling
 * - Cross-platform response wrapping
 * 
 * @example
 * // Make a GET request and parse JSON response
 * const response = EnvironmentAdapter.fetch("https://api.example.com/data");
 * const json = response.getAsJson();
 * console.log(json);
 * 
 * // Sleep for 1 second
 * EnvironmentAdapter.sleep(1000);
 * 
 * // Format a date
 * const formattedDate = EnvironmentAdapter.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
 */
class EnvironmentAdapter {

    static {
        this.environment = this.getEnvironment();
    }

    /**
     * Get the current environment.
     * 
     * @returns {ENVIRONMENT}
     */
    static getEnvironment() {
        if (this.environment !== 'undefined') return this.environment;
        if (typeof UrlFetchApp !== 'undefined') return ENVIRONMENT.APPS_SCRIPT;
        if (typeof process !== 'undefined') return ENVIRONMENT.NODE;
        return ENVIRONMENT.UNKNOWN;
    }

    /**
     * Fetch data from the given URL. 
     * 
     * @param {string} url - The URL to fetch data from.
     * @param {Object} options - Options for the fetch request.
     * @returns {FetchResponse}
     * 
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static fetch(url, options = {}) {
        const env = this.getEnvironment();

        if (env === ENVIRONMENT.APPS_SCRIPT) {
            const response = UrlFetchApp.fetch(url, options);
            return this._wrapAppsScriptResponse(response);
        }

        if (env === ENVIRONMENT.NODE) {
            const method = options.method || "GET";
            
            // for nodejs we use `sync-request` library
            const response = request(method, url, options);
            return this._wrapNodeResponse(response);
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }


    /**
     * Sleep for the given number of milliseconds.
     * 
     * @param {number} ms - The number of milliseconds to sleep.
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static sleep(ms) {
        if (this.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
            EnvironmentAdapter.sleep(ms);
        } 

        if (this.getEnvironment() === ENVIRONMENT.NODE) {
            let done = false;
            new Promise(resolve => {
                setTimeout(() => {
                    done = true;
                    resolve();
                }, ms);
            });

            deasync.loopWhile(() => !done);
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }


    /**
     * Format the given date.
     * 
     * @param {Date} date - The date to format.
     * @param {string} timezone - The timezone to format the date in. 
     * @param {string} format - The format to format the date in.
     * @returns {string}
     * 
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static formatDate(date, timezone, format) {
        if (this.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
            return EnvironmentAdapter.formatDate(date, timezone, format);
        }

        if (this.getEnvironment() === ENVIRONMENT.NODE) {
            return date.toISOString().split("T")[0];;
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }


    /**
     * Get a UUID. Format: `${string}-${string}-${string}-${string}-${string}`
     * 
     * @returns {string} UUID
     * 
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static getUuid() {
        if (this.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
            return EnvironmentAdapter.getUuid();
        }

        if (this.getEnvironment() === ENVIRONMENT.NODE) {
            return crypto.randomUUID();
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }

    /**
     * Encode the given data to base64.
     * 
     * @param {string} data - The data to encode.
     * @returns {string}
     * 
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static base64Encode(data) {
        if (this.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
            return EnvironmentAdapter.base64Encode(data);
        }

        if (this.getEnvironment() === ENVIRONMENT.NODE) {
            return Buffer.from(data).toString('base64');
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }


    /**
     * Compute the HMAC signature for the given data.
     * 
     * @param {string} algorithm - The algorithm to use.
     * @param {string} data - The data to compute the signature for.
     * @param {string} key - The key to use.
     * @returns {string}
     * 
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static computeHmacSignature(algorithm, data, key) {
        if (this.getEnvironment() === ENVIRONMENT.APPS_SCRIPT) {
            if (typeof algorithm === 'string') {
                algorithm = EnvironmentAdapter.MacAlgorithm[algorithm];
            }
            return EnvironmentAdapter.computeHmacSignature(algorithm, data, key);
        }

        if (this.getEnvironment() === ENVIRONMENT.NODE) {
            return crypto.createHmac(algorithm, key).update(data).digest('hex');
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }

    /**
     * Wraps the response from the Apps Script environment.
     * Not use directly, only for internal purposes.
     * 
     * @param {Object} response
     * @returns {FetchResponse}
     */
    static _wrapAppsScriptResponse(response) {
        return {
            getHeaders: () => response.getAllHeaders(),
            getAsJson: () => {
                try { return JSON.parse(response.getContentText()); }
                catch (e) { throw new Error("Invalid JSON response"); }
            },
            getContent: () => response.getContent(),
            getContentText: () => response.getContentText(),
            getResponseCode: () => response.getResponseCode()
        };
    }

    /**
     * Wraps the response from the Node environment.
     * Not use directly, only for internal purposes.
     * 
     * @param {Object} response
     * @returns {FetchResponse}
     */
    static async _wrapNodeResponse(response) {
        const headers = Object.fromEntries(response.headers.entries());
        const text = await response.text();
        return {
            getHeaders: () => headers,
            getAsJson: () => {
                try { return JSON.parse(text); }
                catch (e) { throw new Error("Invalid JSON response"); }
            },
            getContent: () => text,
            getContentText: () => text,
            getResponseCode: () => response.status
        };
    }

}

