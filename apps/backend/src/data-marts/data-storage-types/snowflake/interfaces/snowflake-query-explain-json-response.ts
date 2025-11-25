/**
 * Snowflake query explain JSON response
 * https://docs.snowflake.com/en/sql-reference/sql/explain#examples
 */
export interface SnowflakeQueryExplainJsonResponse {
    GlobalStats: {
        partitionsTotal: number;
        partitionsAssigned: number;
        bytesAssigned: number;
    };
    Operations: SnowflakeQueryExplainJsonOperation[][];
}

export interface SnowflakeQueryExplainJsonOperation {
    id: number;
    operation: string;
    expressions: string[];
    objects: string[];
    partitionsAssigned: number;
    partitionsTotal: number;
    bytesAssigned: number;
    parentOperators: number[];
}