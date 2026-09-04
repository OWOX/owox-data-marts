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

    /**
     * Exponential backoff delay with jitter, in milliseconds.
     *
     * The jitter spreads retries that started together — many runs backing off from the
     * same rate limit — so they do not all come back at the same instant.
     *
     * The result is clamped to the longest delay setTimeout can honour. Doubling passes
     * that ceiling around the twentieth attempt, and beyond it setTimeout falls back to
     * firing after 1ms — turning a long retry chain into a tight loop against the very
     * service it is meant to be backing off from. The clamp guards only that overflow: it
     * sits far above any usable configuration, so a delay a user asked for is never
     * shortened.
     *
     * @param {number} initialDelayMs - Delay before the first retry
     * @param {number} attemptNumber - Current attempt number (1-based)
     * @returns {number} The delay to wait before the next attempt
     */
    static backoffDelay(initialDelayMs, attemptNumber) {
        // Largest 32-bit signed integer: setTimeout's documented maximum, about 24.8 days.
        const maxDelayMs = 2147483647;
        const delay = initialDelayMs * Math.pow(2, attemptNumber - 1) * (0.5 + Math.random());

        return Math.min(delay, maxDelayMs);
    }

};
