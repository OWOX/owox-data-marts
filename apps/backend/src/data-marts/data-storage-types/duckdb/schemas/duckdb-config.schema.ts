import { z } from 'zod';

// DuckDB per-storage config is intentionally empty: the .duckdb file path is
// derived at runtime from the storage id + DUCKDB_DATA_DIR (never user-supplied),
// and schema/table come from the data mart's connector definition.
export const DuckDbConfigSchema = z.object({}).passthrough();
export type DuckDbConfig = z.infer<typeof DuckDbConfigSchema>;
