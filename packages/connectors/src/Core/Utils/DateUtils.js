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
 * const formattedDate = DateUtils.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
 * console.log(formattedDate); // "2025-01-15"
 */
var DateUtils = class DateUtils {

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

};
