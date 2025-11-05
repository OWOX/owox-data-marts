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
    static formatDate(date) {
        return date.toISOString().split("T")[0];
    }

};
