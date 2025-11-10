/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * @typedef {Object} FetchResponse
 * @property {function(): Object} getHeaders
 * @property {function(): Promise<any>} getAsJson
 * @property {function(): Promise<string>} getContent
 * @property {function(): Promise<string>} getContentText
 * @property {function(): number} getResponseCode
 * @property {function(): Promise<Buffer>} getBlob
 */

/**
 * HTTP utilities for making fetch requests
 *
 * @example
 * // Make a GET request and parse JSON response
 * const response = await HttpUtils.fetch("https://api.example.com/data");
 * const json = await response.getAsJson();
 * console.log(json);
 */
var HttpUtils = class HttpUtils {

    /**
     * Fetch data from the given URL.
     *
     * @param {string} url - The URL to fetch data from.
     * @param {Object} options - Options for the fetch request.
     * @returns {Promise<FetchResponse>}
     */
    static async fetch(url, options = {}) {
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

};
