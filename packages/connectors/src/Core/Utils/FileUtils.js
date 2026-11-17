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
        return Array.from(FileUtils.csvRows(csvString, delimiter));
    }

    /**
     * Yield the rows of a CSV string one at a time, so a large file is never held as one
     * array of cells. A quoted field keeps its delimiters, line breaks and spaces, and `""`
     * inside it is one quote; an unquoted field is trimmed. Blank lines are skipped.
     * `Core/Declarative/decoders.js` parses CSV the same way; this file is a bundle script
     * and cannot import it.
     *
     * @param {string} csvString - The CSV string to parse
     * @param {string} [delimiter=','] - The delimiter to use for parsing CSV
     * @yields {Array<string>} The cells of one row
     */
    static *csvRows(csvString, delimiter = ',') {
        let row = [];
        let field = '';
        let isQuoted = false;
        let isInQuotes = false;
        const endField = () => {
            row.push(isQuoted ? field : field.trim());
            field = '';
        };

        for (let i = 0; i <= csvString.length; i++) {
            const c = csvString[i];
            if (isInQuotes && c !== undefined) {
                if (c !== '"') {
                    field += c;
                } else if (csvString[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    isInQuotes = false;
                }
            } else if (c === '"') {
                isInQuotes = true;
                isQuoted = true;
            } else if (c === delimiter) {
                endField();
                isQuoted = false;
            } else if (c === '\n' || c === undefined) {
                const isBlank = row.length === 0 && !isQuoted && field.trim() === '';
                endField();
                if (!isBlank) yield row;
                row = [];
                isQuoted = false;
            } else if (c !== '\r') {
                field += c;
            }
        }
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
