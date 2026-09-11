/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * File utilities for parsing and decompression operations
 *
 * @example
 * // Parse CSV string
 * const data = FileUtils.parseCsv("name,age\nJohn,30\nJane,25");
 * console.log(data); // [["name", "age"], ["John", "30"], ["Jane", "25"]]
 *
 * // Unzip data
 * const files = FileUtils.unzip(zipBuffer);
 * files.forEach(file => {
 *   console.log(file.getDataAsString());
 * });
 */
var FileUtils = class FileUtils {

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

};
