

/**
 * Data types
 * Used in API References and in schema definitions.
 * Can be used in storage type mapping.
 * Should be used in schema definitions instead of string literals.
 * @type {Object}
 */
var DATA_TYPES = {
    
    /**
     * String type. 
     * Commonly used for text fields. Also used for numeric string (ids like Facebook Ad ID, Microsoft Ads ID, etc.) and enum types (e.g. ad status).
     */
    STRING: 'STRING',

    /**
     * Boolean type.
     * Commonly used for boolean fields. 
     * Values: true, false. 
     * "true" and "false", 1, 0 - are not valid values.
     */
    BOOLEAN: 'BOOLEAN',

    /**
     * Integer type.
     * Commonly used for integer fields (e.g. id, count, clicks, impressions, etc.). Also used for size-aware integer fields (int32, int64, unsigned int32, long).
     * Values: 1, 2, 3, etc.
     * 
     */
    INTEGER: 'INTEGER',


    /**
     * Number type.
     * Commonly used for number fields (e.g. price, quantity, ctr, cpc, cpm, etc.). Also used for float fields (float, double, decimal).
     * Values: 1.0, 2.0, 3.0, etc.
     */
    NUMBER: 'NUMBER',
    
    /**
     * Date type.
     * Commonly used for date fields (e.g. date of birth, date of purchase, etc.).
     * Values: 2025-01-01, 2025-01-02, etc.
     */
    DATE: 'DATE',

    /**
     * Datetime type.
     * Commonly used for datetime fields (e.g. date and time of birth, date and time of purchase, etc.).
     * Values: 2025-01-01 12:00:00, 2025-01-02 12:00:00, etc.
     */
    DATETIME: 'DATETIME',

    /**
     * Time type.
     * Commonly used for time fields (e.g. time of birth, time of purchase, etc.).
     * Values: 12:00:00, 12:00:01, etc.
     */
    TIME: 'TIME',

    /**
     * Timestamp type.
     * Commonly used for timestamp fields (e.g. date and time of birth, date and time of purchase, etc.).
     * Values: 2025-01-01 12:00:00, 2025-01-02 12:00:00, etc.
     */
    TIMESTAMP: 'TIMESTAMP',

    /**
     * Array type.
     * Commonly used for array fields (e.g. list of items, list of tags, etc.).
     * Values: [1, 2, 3], ['tag1', 'tag2', 'tag3'], etc.
     */
    ARRAY: 'ARRAY',

    /**
     * Object type.
     * Commonly used for object fields (e.g. json based).
     * Values: {name: 'John', age: 30}, {name: 'Jane', age: 25}, etc.
     */
    OBJECT: 'OBJECT',
};