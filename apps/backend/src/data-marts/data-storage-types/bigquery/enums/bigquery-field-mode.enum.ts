/**
 * {@link ITableFieldSchema#mode}
 */
export enum BigQueryFieldMode {
  NULLABLE = 'NULLABLE',
  REQUIRED = 'REQUIRED',
  REPEATED = 'REPEATED',
}

export function parseBigQueryFieldMode(bigQueryNativeMode: string): BigQueryFieldMode | null {
  const normalizedMode = bigQueryNativeMode.toUpperCase();
  if (Object.values(BigQueryFieldMode).includes(normalizedMode as BigQueryFieldMode)) {
    return normalizedMode as BigQueryFieldMode;
  }
  return null;
}
