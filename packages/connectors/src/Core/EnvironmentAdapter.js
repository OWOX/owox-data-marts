/**
 * @typedef {Object} FetchResponse
 * @property {function(): Object} getHeaders
 * @property {function(): any} getAsJson
 * @property {function(): string|Buffer} getContent
 * @property {function(): string} getContentText
 * @property {function(): number} getResponseCode
 * @property {function(): any} getBlob
 */

/**
 * Environment adapter class that provides a unified interface for environment-specific operations.
 * This class provides Node.js-specific implementations for common operations.
 *
 * Key features:
 * - HTTP request handling
 * - Async delay functionality
 * - Date formatting
 * - Utility functions (UUID, base64, HMAC, etc.)
 *
 * @example
 * // Make a GET request and parse JSON response
 * const response = EnvironmentAdapter.fetch("https://api.example.com/data");
 * const json = response.getAsJson();
 * console.log(json);
 *
 * // Async delay for 1 second
 * await EnvironmentAdapter.delay(1000);
 *
 * // Format a date
 * const formattedDate = EnvironmentAdapter.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
 */
var EnvironmentAdapter = class EnvironmentAdapter {
    
    /**
     * Mac algorithm constants.
     * 
     * @type {Object}
     */
        static get MacAlgorithm() {
            return {
                HMAC_SHA_256: "HMAC_SHA_256",
                HMAC_SHA_384: "HMAC_SHA_384", 
                HMAC_SHA_512: "HMAC_SHA_512",
                HMAC_SHA_1: "HMAC_SHA_1",
                HMAC_MD5: "HMAC_MD5"
            };
        }

    
    constructor() {
        this.environment = this.getEnvironment();
    }
    

    /**
     * Get the current environment.
     * Always returns NODE since Google Apps Script support has been removed.
     *
     * @returns {ENVIRONMENT} The detected environment (NODE or UNKNOWN)
     * @throws {UnsupportedEnvironmentException} If environment cannot be determined
     */
    static getEnvironment() {
        if (typeof this.environment !== 'undefined') {
            return this.environment;
        }
        if (typeof process !== 'undefined') {
            this.environment = ENVIRONMENT.NODE;
        } else {
            this.environment = ENVIRONMENT.UNKNOWN;
        }

        return this.environment;
    }

    /**
     * Fetch data from the given URL.
     *
     * @param {string} url - The URL to fetch data from.
     * @param {Object} options - Options for the fetch request.
     * @returns {Promise<FetchResponse>}
     *
     * @throws {UnsupportedEnvironmentException} If the environment is not supported.
     */
    static async fetch(url, options = {}) {
        const env = this.getEnvironment();

        if (env === ENVIRONMENT.NODE) {
            const method = options.method || "GET";

            // Use native Node.js fetch API
            const fetchOptions = {
                method: method.toUpperCase(),
                headers: options.headers || {},
            };

            if (options.body) {
                fetchOptions.body = options.body;
            }

            const response = await fetch(url, fetchOptions);
            return this._wrapNodeResponse(response);
        }

        throw new UnsupportedEnvironmentException("Unsupported environment");
    }


    /**
     * Async delay for the given number of milliseconds.
     *
     * @param {number} ms - The number of milliseconds to delay.
     * @returns {Promise<void>}
     */
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    /**
     * Format the given date.
     *
     * @param {Date} date - The date to format.
     * @param {string} timezone - The timezone to format the date in (currently ignored in Node.js).
     * @param {string} format - The format to format the date in (currently ignored in Node.js).
     * @returns {string} ISO formatted date (YYYY-MM-DD)
     */
    static formatDate(date, timezone, format) {
        return date.toISOString().split("T")[0];
    }


    /**
     * Get a UUID. Format: `${string}-${string}-${string}-${string}-${string}`
     *
     * @returns {string} UUID
     */
    static getUuid() {
        const crypto = require('node:crypto');
        return crypto.randomUUID();
    }

    /**
     * Encode the given data to base64.
     *
     * @param {string} data - The data to encode.
     * @returns {string}
     */
    static base64Encode(data) {
        return Buffer.from(data).toString('base64');
    }


    /**
     * Compute the HMAC signature for the given data.
     *
     * @param {string} algorithm - The algorithm to use (e.g., 'HMAC_SHA_256', 'sha256').
     * @param {string} data - The data to compute the signature for.
     * @param {string} key - The key to use.
     * @returns {Array<number>} Byte array of the signature
     */
    static computeHmacSignature(algorithm, data, key) {
        const crypto = require('node:crypto');
        // Convert Apps Script algorithm names to Node.js format
        const algorithmMap = {
            'HMAC_SHA_256': 'sha256',
            'HMAC_SHA_384': 'sha384',
            'HMAC_SHA_512': 'sha512',
            'HMAC_SHA_1': 'sha1',
            'HMAC_MD5': 'md5'
        };
        const nodeAlgorithm = algorithmMap[algorithm] || algorithm.toLowerCase().replace('hmac_', '');
        const buffer = crypto.createHmac(nodeAlgorithm, key).update(data).digest();
        return Array.from(buffer);
    }

    /**
     * Parse CSV string into array of arrays
     *
     * @param {string} csvString - The CSV string to parse
     * @param {string} [delimiter=','] - The delimiter to use for parsing CSV
     * @returns {Array<Array<string>>} Parsed CSV data
     */
    static parseCsv(csvString, delimiter = ',') {
        return csvString
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => line.split(delimiter)
            .map(cell => {
                const trimmed = cell.trim();
                // Remove outer quotes if present
                if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                    return trimmed.slice(1, -1).replace(/""/g, '"');
                }
                return trimmed;
            }));
    }

    /**
     * Unzip a blob/buffer
     *
     * @param {Buffer} data - The data to unzip
     * @returns {Array<{getDataAsString: Function}>} Array of file-like objects with getDataAsString method
     */
    static unzip(data) {
        const zip = new AdmZip(data);
        return zip.getEntries().map(entry => ({
            getDataAsString: () => entry.getData().toString('utf8')
        }));
    }

    /**
     * Wraps the response from the Node environment.
     * Not use directly, only for internal purposes.
     *
     * @param {Response} response - Native fetch Response object
     * @returns {FetchResponse}
     */
    static _wrapNodeResponse(response) {
        let textCache = null;
        let blobCache = null;

        const getText = async () => {
            if (textCache === null) {
                textCache = await response.text();
            }
            return textCache;
        };

        const getBlob = async () => {
            if (blobCache === null) {
                blobCache = await response.arrayBuffer();
            }
            return Buffer.from(blobCache);
        };

        // Convert Headers object to plain object
        const headersObj = {};
        response.headers.forEach((value, key) => {
            headersObj[key] = value;
        });

        return {
            getHeaders: () => headersObj,
            getAsJson: () => getText().then(text => {
                try { return JSON.parse(text); }
                catch (e) { throw new Error("Invalid JSON response"); }
            }),
            getContent: () => getText(),
            getContentText: () => getText(),
            getBlob: () => getBlob(),
            getResponseCode: () => response.status
        };
    }

}
