/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Async utilities for asynchronous operations
 *
 * @example
 * // Delay for 1 second
 * await AsyncUtils.delay(1000);
 * console.log("1 second has passed");
 */
var AsyncUtils = class AsyncUtils {

    /**
     * Async delay for the given number of milliseconds.
     *
     * @param {number} ms - The number of milliseconds to delay.
     * @returns {Promise<void>}
     */
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

};
