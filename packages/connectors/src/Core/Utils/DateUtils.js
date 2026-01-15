/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Date utilities for formatting dates
 *
 * @example
 * // Format a date to ISO format (YYYY-MM-DD)
 * const formattedDate = DateUtils.formatDate(new Date());
 * console.log(formattedDate); // "2025-01-15"
 */
var DateUtils = class DateUtils {

    /**
     * Format the given date to ISO format (YYYY-MM-DD).
     *
     * @param {Date} date - The date to format.
     * @returns {string} ISO formatted date (YYYY-MM-DD)
     */
    /**
     * Parse input into a valid Date object or return null.
     * Handles Unix timestamps (numeric strings/numbers) and ISO strings.
     *
     * @param {string|number|null} value - The value to parse
     * @returns {Date|null} Date object or null if invalid/empty
     */
    static parseDate(value) {
        if (!value) {
            return null;
        }

        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }

    static formatDate(date) {
        return date.toISOString().split("T")[0];
    }

};
