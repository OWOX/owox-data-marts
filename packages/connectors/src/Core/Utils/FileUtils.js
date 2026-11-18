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
     * array of cells. A field that starts with `"` is quoted: it keeps its delimiters, line
     * breaks and spaces, `""` inside it is one quote, and spaces around its quotes are
     * dropped. A `"` anywhere else is an ordinary character. Unquoted fields are trimmed and
     * blank lines are skipped. A quote that never closes throws instead of swallowing the
     * rest of the file.
     *
     * Cells are slices of `csvString` rather than strings built a character at a time, so a
     * large file's cells cost about as much memory as the file itself.
     * `Core/Declarative/decoders.js` has its own, untrimmed CSV parser for declarative
     * connectors; this file is a bundle script and cannot import it.
     *
     * @param {string} csvString - The CSV string to parse
     * @param {string} [delimiter=','] - One character that separates fields
     * @yields {Array<string>} The cells of one row
     */
    static *csvRows(csvString, delimiter = ',') {
        if (typeof delimiter !== 'string' || delimiter.length !== 1) {
            throw new Error(`CSV delimiter must be one character, got ${JSON.stringify(delimiter)}`);
        }
        const text = csvString;
        const indexOrEnd = (char, from) => {
            const index = text.indexOf(char, from);
            return index === -1 ? text.length : index;
        };
        let row = [];
        let delimiterAt = -1;
        let newlineAt = -1;
        let pos = 0;

        while (pos <= text.length) {
            if (delimiterAt < pos) delimiterAt = indexOrEnd(delimiter, pos);
            if (newlineAt < pos) newlineAt = indexOrEnd('\n', pos);
            let end = Math.min(delimiterAt, newlineAt);
            let value = text.slice(pos, end).trim();
            const isQuoted = value.startsWith('"');

            if (isQuoted) {
                const quoted = FileUtils.readQuotedField(text, text.indexOf('"', pos));
                delimiterAt = indexOrEnd(delimiter, quoted.end);
                newlineAt = indexOrEnd('\n', quoted.end);
                end = Math.min(delimiterAt, newlineAt);
                const rest = text.slice(quoted.end, end).trim();
                value = rest ? quoted.value + rest : quoted.value;
            }

            row.push(value);
            pos = end + 1;
            if (text[end] === delimiter) continue;
            if (row.length > 1 || value !== '' || isQuoted) yield row;
            row = [];
        }
    }

    /**
     * Read the quoted field whose opening quote is at `openAt`.
     *
     * @param {string} text - The CSV string
     * @param {number} openAt - Index of the opening quote
     * @returns {{value: string, end: number}} The unescaped value and the index after its closing quote
     */
    static readQuotedField(text, openAt) {
        const parts = [];
        let from = openAt + 1;
        for (;;) {
            const closeAt = text.indexOf('"', from);
            if (closeAt === -1) {
                throw new Error(`CSV has a quoted value that never closes, opened at character ${openAt}`);
            }
            parts.push(text.slice(from, closeAt));
            if (text[closeAt + 1] !== '"') {
                return { value: parts.length === 1 ? parts[0] : parts.join('"'), end: closeAt + 1 };
            }
            from = closeAt + 2;
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
