/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Cryptographic utilities for OAuth and security operations
 *
 * @example
 * // Generate a UUID for OAuth nonce
 * const nonce = CryptoUtils.getUuid();
 *
 * // Encode data to base64
 * const encoded = CryptoUtils.base64Encode("my data");
 *
 * // Compute HMAC signature
 * const signature = CryptoUtils.computeHmacSignature(
 *   CryptoUtils.MacAlgorithm.HMAC_SHA_256,
 *   "data to sign",
 *   "secret key"
 * );
 */
var CryptoUtils = class CryptoUtils {

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

};
