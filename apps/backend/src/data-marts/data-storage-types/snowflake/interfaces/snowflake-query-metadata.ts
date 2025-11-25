export interface SnowflakeQueryMetadata {
    columns: SnowflakeQueryColumnMetadata[];
}

export interface SnowflakeQueryColumnMetadata {
    name: string;
    type: string;
    nullable: boolean;
    precision: number;
    scale: number;
}
    